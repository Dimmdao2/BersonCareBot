import type {
  DeliveryAdapter,
  DeliverySendResult,
  DispatchPort,
  DbWritePort,
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
import { classifyRecipientBlockedBotError } from '../delivery/recipientBotBlocked.js';
import {
  getCurrentOrganizationPrincipalId,
} from '../principal/organizationPrincipal.js';
import { readChannel } from './channelRouting.js';
import { assertOutboundMessagePolicy } from './outboundMessagePolicy.js';
import type {
  ClinicDeliveryChannel,
  ClinicDeliveryCredential,
} from '../db/clinicDeliveryCredentials.js';

const DELIVERY_ATTEMPT_AUDIT_PERSIST_FAILED = 'DELIVERY_ATTEMPT_AUDIT_PERSIST_FAILED';
let deliveryAttemptAuditPersistFailureCount = 0;

export type DispatchPlatformIntegrationId = 'telegram' | 'max' | 'email' | 'smsc' | 'web_push';

type DeliveryPayload = {
  recipient?: { chatId?: unknown; phoneNormalized?: unknown };
  message?: { text?: unknown };
  delivery?: {
    channels?: unknown;
    maxAttempts?: unknown;
    senderScope?: unknown;
    clinicCredential?: ClinicDeliveryCredential;
  };
} & Record<string, unknown>;

type ClinicSenderScope = 'clinic_required' | 'clinic_preferred' | 'platform_required';

function clinicSenderScope(intent: OutgoingIntent): ClinicSenderScope {
  // Platform/system traffic must never borrow a clinic credential merely because the request
  // happens to run under an organization principal.
  if (
    intent.meta.outboundMessageClass === 'operator_security' &&
    intent.meta.outboundCapability === 'operator_alert'
  ) {
    return 'platform_required';
  }
  if (intent.type !== 'message.send') return 'clinic_preferred';
  const scope = (intent.payload as DeliveryPayload).delivery?.senderScope;
  return scope === 'clinic_required' ? 'clinic_required' : 'clinic_preferred';
}

function asClinicDeliveryChannel(channel: string): ClinicDeliveryChannel | null {
  return channel === 'email' || channel === 'smsc' || channel === 'telegram' || channel === 'max'
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

function isOtpIntent(intent: OutgoingIntent): boolean {
  return typeof intent.meta.eventId === 'string' && intent.meta.eventId.startsWith('otp:');
}

function sanitizePayloadForLogs(intent: OutgoingIntent): Record<string, unknown> {
  if (!isOtpIntent(intent)) {
    return intent.payload as Record<string, unknown>;
  }
  // OTP-код не должен попадать в delivery_attempt_logs.
  return {
    kind: 'otp_redacted',
    channel: readChannel(intent),
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
    channel === 'email' ||
    channel === 'web_push'
  ) {
    return channel;
  }
  return null;
}

async function logDeliveryAttempt(
  writePort: DbWritePort | undefined,
  intent: OutgoingIntent,
  channel: string,
  status: 'success' | 'failed' | 'skipped',
  attempt: number,
  reason?: string,
): Promise<void> {
  if (!writePort) return;
  const safeCorrelationId = isOtpIntent(intent) ? null : (intent.meta.correlationId ?? null);
  const organizationId = getCurrentOrganizationPrincipalId();
  const writeAttempt = () =>
    writePort.writeDb({
      type: 'delivery.attempt.log',
      params: {
        intentType: intent.type,
        intentEventId: intent.meta.eventId,
        correlationId: safeCorrelationId,
        channel,
        status,
        attempt,
        reason: reason ?? null,
        organizationId,
        payload: sanitizePayloadForLogs(intent),
        occurredAt: new Date().toISOString(),
      },
    });

  await writeAttempt();
}

function reportDeliveryAttemptAuditPersistFailure(
  auditError: unknown,
  intent: OutgoingIntent,
  channel: string,
  status: 'success' | 'failed' | 'skipped',
): void {
  deliveryAttemptAuditPersistFailureCount += 1;
  const fields = {
    auditError,
    code: DELIVERY_ATTEMPT_AUDIT_PERSIST_FAILED,
    deliveryAttemptAuditPersistFailureCount,
    channel,
    status,
    intentType: intent.type,
  };
  const message =
    status === 'success'
      ? 'Delivery succeeded but its attempt audit could not be persisted'
      : 'Delivery provider failed and its attempt audit could not be persisted';
  try {
    logger.error(fields, message);
  } catch {
    // Delivery remains authoritative even if the structured logger transport is degraded.
    // The fallback deliberately excludes the original error and intent payload.
    try {
      console.error(message, {
        code: DELIVERY_ATTEMPT_AUDIT_PERSIST_FAILED,
        deliveryAttemptAuditPersistFailureCount,
        channel,
        status,
        intentType: intent.type,
      });
    } catch {
      /* observability failure must never replace the provider outcome */
    }
  }
}

/** @internal Test-only reset for the process-local observability counter. */
export function resetDeliveryAttemptAuditPersistFailureCountForTests(): void {
  deliveryAttemptAuditPersistFailureCount = 0;
}

/** Sentinel returned by the pre-fork redirect when a send must be suppressed. */
const SUPPRESS = Symbol('dev_redirect_suppress');
type RedirectResult = OutgoingIntent | typeof SUPPRESS;

/**
 * PRE-FORK DEV DELIVERY REDIRECT (primary, authoritative override layer).
 *
 * When active (NODE_ENV !== 'production' OR DEV_DELIVERY_REDIRECT=1), every
 * outgoing intent is redirected to the dev TEST USER's binding FOR ITS OWN CHANNEL
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
 * Builds unified dispatch pipeline with retries and fallback channels.
 * Channel order comes from domain-provided `payload.delivery.channels`.
 */
export function createDefaultDispatchPort(deps: {
  adapters: DeliveryAdapter[];
  writePort?: DbWritePort;
  readPort?: unknown;
  isPlatformIntegrationEnabled?: (integrationId: DispatchPlatformIntegrationId) => Promise<boolean>;
  /** Exact-org tariff + credential resolver. It never returns a platform fallback credential. */
  resolveClinicDeliveryCredential?: (
    channel: ClinicDeliveryChannel,
  ) => Promise<ClinicDeliveryCredential | null>;
}): DispatchPort {
  return {
    async dispatchOutgoing(intent: OutgoingIntent): Promise<DeliverySendResult> {
      // Policy is the first egress operation: denied payloads cannot be redirected, logged,
      // adapter-selected, or passed to a provider.
      assertOutboundMessagePolicy(intent);
      // PRIMARY DEV REDIRECT: override before the channel fork so no adapter can
      // ever be reached with a real recipient in non-production environments.
      const safeIntent = applyPreForkDevRedirect(intent);

      // SUPPRESS: the test user has no binding for this channel (or unknown channel).
      // No-op success — never reach an adapter, never a real client (D7).
      if (safeIntent === SUPPRESS) {
        if (intent.type === 'message.send') {
          await logDeliveryAttempt(
            deps.writePort,
            intent,
            readChannel(intent) ?? 'unknown',
            'success',
            1,
            'dev_redirect_suppressed',
          );
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
      let sendResult: DeliverySendResult | void;
      try {
        const clinicChannel = asClinicDeliveryChannel(channel);
        const senderScope = clinicSenderScope(intentForChannel);
        const clinicCredential =
          senderScope !== 'platform_required' && clinicChannel && deps.resolveClinicDeliveryCredential
            ? await deps.resolveClinicDeliveryCredential(clinicChannel)
            : null;
        if (senderScope === 'clinic_required' && !clinicCredential) {
          throw new Error(`CLINIC_CHANNEL_NOT_CONFIGURED:${channel}`);
        }
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
        if (intent.type === 'message.send') {
          const blocked = classifyRecipientBlockedBotError(providerError, channel);
          try {
            await logDeliveryAttempt(
              deps.writePort,
              intent,
              channel,
              blocked ? 'skipped' : 'failed',
              1,
              blocked ? 'recipient_blocked_bot' : 'provider_rejected',
            );
          } catch (auditError) {
            reportDeliveryAttemptAuditPersistFailure(
              auditError,
              intent,
              channel,
              blocked ? 'skipped' : 'failed',
            );
          }
        }
        throw providerError;
      }
      if (intent.type === 'message.send') {
        const outcome = sendResult?.webPushOutcome;
        const auditStatus: 'success' | 'failed' | 'skipped' =
          outcome?.status === 'skipped'
            ? 'skipped'
            : outcome?.status === 'failed'
              ? 'failed'
              : 'success';
        const auditReason =
          auditStatus === 'skipped'
            ? (outcome?.reason ?? 'provider_skipped')
            : auditStatus === 'failed'
              ? 'provider_rejected'
              : undefined;
        try {
          await logDeliveryAttempt(
            deps.writePort,
            intent,
            channel,
            auditStatus,
            1,
            auditReason,
          );
        } catch (auditError) {
          reportDeliveryAttemptAuditPersistFailure(auditError, intent, channel, auditStatus);
        }
      }
      return sendResult ?? {};
    },
  };
}
