import type {
  DbWritePort,
  DeliveryAdapter,
  DeliverySendResult,
  DispatchOutgoingOpts,
  DispatchPort,
  OutgoingIntent,
} from '../../kernel/contracts/index.js';
import {
  isLocalDevelopmentDeliverySuppressed,
  isTestDeployment,
  isTestDeliveryRecipientAllowed,
} from '../../shared/testDeliverySafety.js';
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

function isPreProviderAdapterFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /^(?:MAX|TELEGRAM|VK)_RUNTIME_CONFIG_UNAVAILABLE$/u.test(message) ||
    /^(?:MAX|TELEGRAM|VK|EMAIL|WEB_PUSH)_PAYLOAD_INVALID(?::|$)/u.test(message) ||
    message === 'EMAIL_NOT_CONFIGURED' ||
    message === 'WEB_PUSH_ORGANIZATION_PRINCIPAL_REQUIRED'
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

/** Sentinel returned by the pre-fork environment gate when a send must be suppressed. */
const SUPPRESS = Symbol('environment_delivery_suppress');
type EnvironmentDeliveryResult = OutgoingIntent | typeof SUPPRESS;

/**
 * Single pre-provider environment gate.
 * Local development is provider-free. When `TEST=true`, only original recipients listed in the
 * TEST_ACCOUNT_* env variables may reach an adapter. Nothing is redirected and no message body is
 * changed. In production (`TEST` absent/false) the original intent passes unchanged.
 */
function applyPreForkEnvironmentDeliveryPolicy(intent: OutgoingIntent): EnvironmentDeliveryResult {
  const payload = (intent.payload ?? {}) as DeliveryPayload & Record<string, unknown>;
  const recipient = payload.recipient as Record<string, unknown> | undefined;
  const intendedChannel = readChannel(intent);

  if (isLocalDevelopmentDeliverySuppressed()) {
    logger.warn(
      {
        intendedChannel,
        intentType: intent.type,
      },
      'PRE_FORK_LOCAL_DELIVERY_NOOP',
    );
    return SUPPRESS;
  }

  if (!isTestDeployment()) return intent;

  if (!isTestDeliveryRecipientAllowed(intendedChannel, recipient)) {
    logger.warn(
      {
        intendedChannel,
        intentType: intent.type,
      },
      'PRE_FORK_TEST_DELIVERY_SUPPRESS',
    );
    return SUPPRESS;
  }

  logger.info(
    {
      intendedChannel,
      intentType: intent.type,
    },
    'PRE_FORK_TEST_DELIVERY_ALLOWED',
  );
  return intent;
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
      const safeIntent = applyPreForkEnvironmentDeliveryPolicy(intent);

      // No provider was called, so suppression is not a delivery attempt.
      if (safeIntent === SUPPRESS) {
        // `C5(б)`: канал включает только доставленная отправка. Подавленная средой проверка
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
      // same treatment as environment suppression). Either way the original error is rethrown
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
        // Adapter-local configuration and payload validation happens before any network call.
        // Keep those durable in the queue, but do not manufacture a provider-attempt fact.
        if (isPreProviderAdapterFailure(providerError)) throw providerError;
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
