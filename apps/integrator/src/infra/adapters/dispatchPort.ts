import type {
  DeliveryAdapter,
  DeliverySendResult,
  DispatchPort,
  DbWritePort,
  OutgoingIntent,
} from '../../kernel/contracts/index.js';
import {
  isDevRedirectActive,
  buildDevPrefix,
  hasDevPrefix,
  resolveDevRedirect,
} from '../../shared/devDeliveryRedirect.js';
import { logger } from '../observability/logger.js';
import { readChannel } from './channelRouting.js';

type DeliveryPayload = {
  recipient?: { chatId?: unknown; phoneNormalized?: unknown };
  message?: { text?: unknown };
  delivery?: { channels?: unknown; maxAttempts?: unknown };
} & Record<string, unknown>;

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

async function logDeliveryAttempt(
  writePort: DbWritePort | undefined,
  intent: OutgoingIntent,
  channel: string,
  status: 'success' | 'failed',
  attempt: number,
  reason?: string,
): Promise<void> {
  if (!writePort) return;
  const safeCorrelationId = isOtpIntent(intent) ? null : intent.meta.correlationId ?? null;
  await writePort.writeDb({
    type: 'delivery.attempt.log',
    params: {
      intentType: intent.type,
      intentEventId: intent.meta.eventId,
      correlationId: safeCorrelationId,
      channel,
      status,
      attempt,
      reason: reason ?? null,
      payload: sanitizePayloadForLogs(intent),
      occurredAt: new Date().toISOString(),
    },
  });
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
        : (origRecipient?.email as string | undefined) ??
          (origRecipient?.phoneNormalized as string | undefined) ??
          (origRecipient?.pushUserId as string | undefined) ??
          (origRecipient?.userId as string | number | undefined) ??
          intent.meta.source ??
          'unknown';

  const intendedChannel = readChannel(intent);
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
}): DispatchPort {
  return {
    async dispatchOutgoing(intent: OutgoingIntent): Promise<DeliverySendResult> {
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
      const intentForChannel = withChannel(safeIntent, channel);
      const adapter = deps.adapters.find((item) => item.canHandle(intentForChannel));
      if (!adapter) throw new Error(`CHANNEL_NOT_SUPPORTED:${channel}`);
      const sendResult = await adapter.send(intentForChannel);
      if (intent.type === 'message.send') {
        await logDeliveryAttempt(deps.writePort, intent, channel, 'success', 1);
      }
      return sendResult ?? {};
    },
  };
}
