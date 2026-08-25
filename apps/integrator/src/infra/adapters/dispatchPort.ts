import type {
  DbWritePort,
  DeliveryAdapter,
  DeliverySendResult,
  DispatchOutgoingOpts,
  DispatchPort,
  OutgoingIntent,
} from '../../kernel/contracts/index.js';
import {
  isDevRedirectActive,
  isDevRedirectPassthrough,
  buildDevPrefix,
  hasDevPrefix,
  resolveDevRedirect,
} from '../../shared/devDeliveryRedirect.js';
import { logger } from '../observability/logger.js';
import { readChannel } from './channelRouting.js';
import { assertOutboundMessagePolicy } from './outboundMessagePolicy.js';
import { classifyRecipientBlockedBotError } from '../delivery/recipientBotBlocked.js';
import type {
  ClinicDeliveryChannel,
  ClinicDeliveryCredential,
  ClinicDeliveryCredentialResolveOptions,
} from '../db/clinicDeliveryCredentials.js';

const providerAttemptFailures = new WeakSet<object>();

function markProviderAttemptFailure(error: unknown): unknown {
  if ((typeof error === 'object' && error !== null) || typeof error === 'function') {
    providerAttemptFailures.add(error);
    return error;
  }
  const normalized = new Error(String(error));
  providerAttemptFailures.add(normalized);
  return normalized;
}

/** True only for an error thrown by an actual DeliveryAdapter.send provider call. */
export function isProviderAttemptFailure(error: unknown): boolean {
  return (
    ((typeof error === 'object' && error !== null) || typeof error === 'function') &&
    providerAttemptFailures.has(error)
  );
}

export type DispatchPlatformIntegrationId =
  'telegram' | 'max' | 'vk' | 'email' | 'smsc' | 'web_push';

type DeliveryPayload = {
  recipient?: { chatId?: unknown; phoneNormalized?: unknown };
  message?: { text?: unknown };
  delivery?: {
    channels?: unknown;
    maxAttempts?: unknown;
    senderScope?: unknown;
    clinicCredential?: ClinicDeliveryCredential;
    clinicCredentialProbe?: unknown;
  };
} & Record<string, unknown>;

type ClinicSenderScope = 'clinic_required' | 'clinic_preferred' | 'platform_required';

type RequestedSenderScope = 'clinic_required' | 'clinic_if_configured';

/**
 * `C3` + §1.2h: на пути по умолчанию клиника не настраивает ничего, поэтому `clinic_if_configured`
 * повышается до `clinic_required` ТОЛЬКО когда у организации действительно есть включённый канал.
 * Без кредентиала это платформенный отправитель, а не отказ доставки.
 */
async function clinicSenderScope(
  intent: OutgoingIntent,
  channel: ClinicDeliveryChannel | null,
  resolveCredential:
    | ((
        channel: ClinicDeliveryChannel,
        opts?: ClinicDeliveryCredentialResolveOptions,
      ) => Promise<ClinicDeliveryCredential | null>)
    | undefined,
): Promise<{ senderScope: ClinicSenderScope; clinicCredential: ClinicDeliveryCredential | null }> {
  // Platform/system traffic must never borrow a clinic credential merely because the request
  // happens to run under an organization principal.
  if (
    intent.meta.outboundMessageClass === 'operator_security' &&
    intent.meta.outboundCapability === 'operator_alert'
  ) {
    return { senderScope: 'platform_required', clinicCredential: null };
  }
  const requestedScope =
    intent.type === 'message.send'
      ? ((intent.payload as DeliveryPayload).delivery?.senderScope as
          RequestedSenderScope | undefined)
      : undefined;
  const clinicCredential = channel && resolveCredential ? await resolveCredential(channel) : null;

  if (requestedScope === 'clinic_required') {
    return { senderScope: 'clinic_required', clinicCredential };
  }
  if (requestedScope === 'clinic_if_configured') {
    return {
      senderScope: clinicCredential ? 'clinic_required' : 'platform_required',
      clinicCredential,
    };
  }
  return { senderScope: 'clinic_preferred', clinicCredential };
}

/** `C5(б)`: проверочная отправка, которой клиника включает свой канал. */
function isClinicCredentialProbe(intent: OutgoingIntent): boolean {
  if (intent.type !== 'message.send') return false;
  return (intent.payload as DeliveryPayload).delivery?.clinicCredentialProbe === true;
}

function asClinicDeliveryChannel(channel: string): ClinicDeliveryChannel | null {
  return channel === 'email' ||
    channel === 'smsc' ||
    channel === 'telegram' ||
    channel === 'max' ||
    channel === 'vk'
    ? channel
    : null;
}

function withClinicCredential(
  intent: OutgoingIntent,
  credential: ClinicDeliveryCredential,
): OutgoingIntent {
  if (intent.type !== 'message.send') return intent;
  const payload = intent.payload as DeliveryPayload;
  return {
    ...intent,
    payload: {
      ...payload,
      delivery: { ...(payload.delivery ?? {}), clinicCredential: credential },
    },
  };
}

function withChannel(intent: OutgoingIntent, channel: string): OutgoingIntent {
  if (intent.type !== 'message.send') return intent;
  const payload = (intent.payload ?? {}) as DeliveryPayload;
  const delivery = { ...(payload.delivery ?? {}), channels: [channel] };
  return {
    ...intent,
    payload: {
      ...payload,
      delivery,
    },
  };
}

function platformIntegrationIdForChannel(channel: string): DispatchPlatformIntegrationId | null {
  if (channel === 'sms' || channel === 'smsc') return 'smsc';
  if (
    channel === 'telegram' ||
    channel === 'max' ||
    channel === 'vk' ||
    channel === 'email' ||
    channel === 'web_push'
  ) {
    return channel;
  }
  return null;
}

/** Sentinel returned by the pre-fork redirect when a send must be suppressed. */
const SUPPRESS = Symbol('dev_redirect_suppress');
type RedirectResult = OutgoingIntent | typeof SUPPRESS;

/**
 * PRE-FORK DEV DELIVERY REDIRECT (primary, authoritative override layer).
 *
 * In local development every outgoing intent is suppressed before any adapter.
 * When the explicit TEST redirect is active (DEV_DELIVERY_REDIRECT=1), every
 * outgoing intent is redirected to the TEST USER's binding FOR ITS OWN CHANNEL
 * BEFORE it branches to any channel adapter:
 *   telegram → his telegram chat, max → his max id, sms/smsc → his phone,
 *   email → his email, web_push → his subscription (via pushUserId).
 * The channel is PRESERVED so the tester experiences the real client app per channel.
 *
 * If the test user has NO binding for the intent's channel (or the channel is
 * unknown), the send is SUPPRESSED — `applyPreForkDevRedirect` returns the SUPPRESS
 * sentinel and `dispatchOutgoing` short-circuits without reaching any adapter. This
 * guarantees a send NEVER reaches a real client and NEVER a different person (D7).
 *
 * This is the SINGLE chokepoint (owner's hard rule: no per-channel duplication).
 * Per-channel guards in telegram/max clients remain as defense-in-depth.
 *
 * Pure function of env + intent — no DB, no IO (keeps the hot path cheap).
 */
function applyPreForkDevRedirect(intent: OutgoingIntent): RedirectResult {
  if (!isDevRedirectActive()) return intent;

  const payload = (intent.payload ?? {}) as DeliveryPayload & Record<string, unknown>;

  // Read original recipient for logging/prefix.
  const origRecipient = payload.recipient as Record<string, unknown> | undefined;
  const origChatId = origRecipient?.chatId;
  const originalId =
    typeof origChatId === 'number'
      ? origChatId
      : typeof origChatId === 'string'
        ? origChatId
        : ((origRecipient?.email as string | undefined) ??
          (origRecipient?.phoneNormalized as string | undefined) ??
          (origRecipient?.pushUserId as string | undefined) ??
          (origRecipient?.userId as string | number | undefined) ??
          intent.meta.source ??
          'unknown');

  const intendedChannel = readChannel(intent);

  // Local DEV is provider-free by contract. TEST runs with NODE_ENV=production and the explicit
  // redirect flag, so its live owner-account delivery proof remains available without allowing
  // a local scheduler/worker/API process to call any external provider.
  if (process.env.NODE_ENV === 'development') {
    logger.warn(
      {
        intendedRecipient: originalId,
        intendedChannel,
        intentType: intent.type,
      },
      'PRE_FORK_DEV_DELIVERY_NOOP',
    );
    return SUPPRESS;
  }

  // PASSTHROUGH: a recipient that is a KNOWN TEST ACCOUNT (env allowlist) is
  // delivered UNCHANGED so multi-tester flows (doctor↔patient chat/comments/OTP)
  // can be exercised in-vivo on a real-data test env. The allowlist is empty by
  // default, so this never fires — and real clients stay redirected/suppressed —
  // unless an operator explicitly opts in via DEV_REDIRECT_PASSTHROUGH_*.
  if (isDevRedirectPassthrough(intendedChannel, origRecipient)) {
    logger.warn(
      {
        passthroughRecipient: originalId,
        intendedChannel,
        intentType: intent.type,
      },
      'PRE_FORK_DEV_DELIVERY_PASSTHROUGH',
    );
    return intent;
  }

  const outcome = resolveDevRedirect(intendedChannel);

  if (outcome.kind === 'suppress') {
    logger.warn(
      {
        intendedRecipient: originalId,
        intendedChannel,
        intentType: intent.type,
        suppressReason: outcome.reason,
      },
      'PRE_FORK_DEV_DELIVERY_REDIRECT_SUPPRESS',
    );
    return SUPPRESS;
  }

  logger.warn(
    {
      intendedRecipient: originalId,
      intendedChannel,
      sentTo: outcome.label,
      sentChannel: outcome.deliveryChannel,
      intentType: intent.type,
    },
    'PRE_FORK_DEV_DELIVERY_REDIRECT',
  );

  // Prefix text body (message.send carries message.text; others may not have text).
  const origMessage = payload.message as Record<string, unknown> | undefined;
  const origText = typeof origMessage?.text === 'string' ? origMessage.text : undefined;
  const newText =
    origText !== undefined && !hasDevPrefix(origText)
      ? buildDevPrefix(originalId) + origText
      : origText;

  const newMessage =
    origMessage !== undefined
      ? { ...origMessage, ...(newText !== undefined ? { text: newText } : {}) }
      : undefined;

  // Preserve the channel; only rewrite delivery.channels[0] to the canonical wire value.
  const origDelivery = payload.delivery as Record<string, unknown> | undefined;
  const newDelivery =
    origDelivery !== undefined
      ? { ...origDelivery, channels: [outcome.deliveryChannel] }
      : { channels: [outcome.deliveryChannel] };

  return {
    ...intent,
    meta: {
      ...intent.meta,
      source: outcome.deliveryChannel,
    },
    payload: {
      ...payload,
      // Fresh recipient object containing ONLY this channel's id field(s) — no real
      // email/phone/pushUserId/userId from the original intent can survive.
      recipient: outcome.recipient,
      ...(newMessage !== undefined ? { message: newMessage } : {}),
      delivery: newDelivery,
    },
  };
}

/**
 * A real failed provider call, outside `opts.skipAttemptLog` (the queue-backed worker's own
 * better-informed write — see below). Track D F5/F6 follow-up: the operator journal is
 * "deliberately shared by all producers" (`operatorDeliveryAttempts.ts`) — a non-queue-backed
 * caller (OTP/booking/admin relay routes) has no `outgoing_delivery_queue` row, but each such
 * call is itself exactly one real, non-retried provider attempt, so `attempt: 1` and
 * `id: eventId` are true facts here, not placeholders. `recipient_blocked_bot` stays excluded
 * (F5: an expected terminal state, not a delivery attempt), matching the queue worker's own
 * classification.
 */
async function recordGenericDispatchFailureAttempt(
  writePort: DbWritePort,
  intent: OutgoingIntent,
  channel: string,
  err: unknown,
): Promise<void> {
  const blocked = classifyRecipientBlockedBotError(err, channel);
  if (blocked) return;
  try {
    await writePort.writeDb({
      type: 'delivery.attempt.log',
      params: {
        intentType: intent.type,
        intentEventId: intent.meta.eventId,
        correlationId: intent.meta.correlationId ?? null,
        channel,
        status: 'failed',
        attempt: 1,
        reason: 'provider_rejected',
        occurredAt: new Date().toISOString(),
      },
    });
  } catch (auditError) {
    logger.warn(
      { err: auditError, eventId: intent.meta.eventId, channel },
      'dispatch_generic_attempt_log_failed',
    );
  }
}

/**
 * Builds unified dispatch pipeline with retries and fallback channels.
 * Channel order comes from domain-provided `payload.delivery.channels`.
 *
 * Success, dev-redirect suppression, and `recipient_blocked_bot` never write a delivery-attempt
 * record (Track D final cutover #987, audit F5): a duplicate success/skip journal entry is
 * exactly the second journal Track D retired. A real failed provider call DOES write one real
 * operator-journal attempt row (F5/F6 follow-up) — unless the caller passes
 * `opts.skipAttemptLog`, which the queue-backed outgoing-delivery worker does, because it already
 * has the real queue row id and real attempt count and records a better attempt itself at
 * `handleDispatchFailure` in outgoingDeliveryWorker.ts (writing both here and there would
 * duplicate the same failure).
 */
export function createDefaultDispatchPort(deps: {
  adapters: DeliveryAdapter[];
  readPort?: unknown;
  /** Omitted only in tests that don't exercise a real failure path; di.ts always provides it. */
  writePort?: DbWritePort;
  isPlatformIntegrationEnabled?: (integrationId: DispatchPlatformIntegrationId) => Promise<boolean>;
  /** Exact-org tariff + credential resolver. It never returns a platform fallback credential. */
  resolveClinicDeliveryCredential?: (
    channel: ClinicDeliveryChannel,
    options?: ClinicDeliveryCredentialResolveOptions,
  ) => Promise<ClinicDeliveryCredential | null>;
}): DispatchPort {
  return {
    async dispatchOutgoing(
      intent: OutgoingIntent,
      opts?: DispatchOutgoingOpts,
    ): Promise<DeliverySendResult> {
      // Policy is the first egress operation: denied payloads cannot be redirected, logged,
      // adapter-selected, or passed to a provider.
      assertOutboundMessagePolicy(intent);
      // PRIMARY DEV REDIRECT: override before the channel fork so no adapter can
      // ever be reached with a real recipient in non-production environments.
      const safeIntent = applyPreForkDevRedirect(intent);

      // SUPPRESS: the test user has no binding for this channel (or unknown channel).
      // No-op success — never reach an adapter, never a real client (D7). No provider was ever
      // called, so this is not a delivery attempt (F5) — the suppression itself is still fully
      // observable via the PRE_FORK_DEV_DELIVERY_REDIRECT_SUPPRESS warning above.
      if (safeIntent === SUPPRESS) {
        // `C5(б)`: канал включает только доставленная отправка. Подавленная на DEV проверка
        // успехом не является — иначе клиника включила бы канал, ничего не доставив.
        if (isClinicCredentialProbe(intent)) {
          throw new Error('CLINIC_CHANNEL_PROBE_SUPPRESSED');
        }
        return {};
      }

      const channel = readChannel(safeIntent);
      if (!channel) throw new Error('CHANNEL_NOT_SPECIFIED');
      const integrationId = platformIntegrationIdForChannel(channel);
      if (
        integrationId &&
        deps.isPlatformIntegrationEnabled &&
        !(await deps.isPlatformIntegrationEnabled(integrationId))
      ) {
        throw new Error(`PLATFORM_INTEGRATION_DISABLED:${integrationId}`);
      }
      const intentForChannel = withChannel(safeIntent, channel);
      const adapter = deps.adapters.find((item) => item.canHandle(intentForChannel));
      if (!adapter) throw new Error(`CHANNEL_NOT_SUPPORTED:${channel}`);
      // A thrown providerError here is a real failed provider call. When the caller is the
      // queue-backed worker (opts.skipAttemptLog), it already knows the real
      // outgoing_delivery_queue row id and its current attempt count and records the one real
      // attempt itself in handleDispatchFailure. Every other caller has no such row, so this
      // chokepoint records the one real attempt itself (recordGenericDispatchFailureAttempt),
      // after classifying recipient_blocked_bot the same way the queue worker does (F5: a
      // blocked-bot rejection is not a delivery attempt either, it is an expected terminal state,
      // same treatment as dev-redirect suppression). Either way the original error is rethrown
      // unchanged.
      let sendResult: DeliverySendResult | void;
      const clinicChannel = asClinicDeliveryChannel(channel);
      const probe = isClinicCredentialProbe(intentForChannel);
      // Проверочная отправка идёт ИМЕННО ещё не подтверждённым кредентиалом: иначе включить
      // канал было бы невозможно — резолвер отдаёт только уже включённые (`C5(б)`).
      const probeCredential =
        probe && clinicChannel && deps.resolveClinicDeliveryCredential
          ? await deps.resolveClinicDeliveryCredential(clinicChannel, { allowUnverified: true })
          : null;
      const resolved = probe
        ? { senderScope: 'clinic_required' as ClinicSenderScope, clinicCredential: probeCredential }
        : await clinicSenderScope(
            intentForChannel,
            clinicChannel,
            deps.resolveClinicDeliveryCredential,
          );
      const senderScope = resolved.senderScope;
      const clinicCredential = resolved.clinicCredential;
      if (senderScope === 'clinic_required' && !clinicCredential) {
        throw new Error(`CLINIC_CHANNEL_NOT_CONFIGURED:${channel}`);
      }
      try {
        if (clinicCredential) {
          try {
            sendResult = await adapter.send(
              withClinicCredential(intentForChannel, clinicCredential),
            );
          } catch (clinicError) {
            // Essential traffic remains deliverable through the platform. Clinic-required flows
            // (broadcasts and bot support) must never silently assume the platform sender.
            if (senderScope === 'clinic_required') throw clinicError;
            sendResult = await adapter.send(intentForChannel);
          }
        } else {
          sendResult = await adapter.send(intentForChannel);
        }
      } catch (providerError) {
        const attemptedFailure = markProviderAttemptFailure(providerError);
        if (!opts?.skipAttemptLog && deps.writePort) {
          await recordGenericDispatchFailureAttempt(
            deps.writePort,
            intent,
            channel,
            attemptedFailure,
          );
        }
        throw attemptedFailure;
      }
      // Success, or a completed-but-skipped webPushOutcome, is not a delivery attempt (F5): the
      // surviving outgoing_delivery_queue row's own status/sent_at/failure_class is the lifecycle
      // fact; a duplicate success/skip journal entry is exactly the second journal Track D retired.
      return sendResult ?? {};
    },
  };
}
