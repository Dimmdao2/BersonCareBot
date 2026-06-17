import type {
  DeliveryAdapter,
  DeliverySendResult,
  DispatchPort,
  DbWritePort,
  OutgoingIntent,
} from '../../kernel/contracts/index.js';
import {
  isDevRedirectActive,
  getDevRedirectChatId,
  buildDevPrefix,
  hasDevPrefix,
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

/**
 * PRE-FORK DEV DELIVERY REDIRECT (primary override layer).
 *
 * When active (NODE_ENV !== 'production' OR DEV_DELIVERY_REDIRECT=1), every
 * outgoing intent is collapsed to the single test telegram chat BEFORE it
 * branches to any channel adapter. This is the primary, authoritative override:
 * one place guarantees no new channel can ever be missed.
 *
 * Per-channel guards in telegram/max clients are kept as defense-in-depth.
 *
 * Channel collapse: non-telegram intents become telegram intents addressed to the
 * test chat. This is intentional — there is one test recipient (telegram), and the
 * owner explicitly requested everything collapse there.
 *
 * Intents that carry no user recipient (callback.answer, message.delete to the
 * same chat, etc.) are also redirected so the underlying API call cannot leak to
 * a real chat_id embedded in the payload.
 */
function applyPreForkDevRedirect(intent: OutgoingIntent): OutgoingIntent {
  if (!isDevRedirectActive()) return intent;

  const testChatId = getDevRedirectChatId();
  const payload = (intent.payload ?? {}) as DeliveryPayload & Record<string, unknown>;

  // Read original recipient for logging/prefix.
  const origRecipient = payload.recipient as Record<string, unknown> | undefined;
  const origChatId = origRecipient?.chatId;
  const originalId =
    typeof origChatId === 'number'
      ? origChatId
      : typeof origChatId === 'string'
        ? origChatId
        : intent.meta.source ?? 'unknown';

  logger.warn(
    {
      intendedChatId: originalId,
      intendedChannel: readChannel(intent),
      sentTo: testChatId,
      sentChannel: 'telegram',
      intentType: intent.type,
    },
    'PRE_FORK_DEV_DELIVERY_REDIRECT',
  );

  // Redirect recipient to test chat id.
  const redirectedRecipient = { chatId: testChatId };

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

  // Force channel to telegram (collapse everything to the single test recipient).
  const origDelivery = payload.delivery as Record<string, unknown> | undefined;
  const newDelivery =
    origDelivery !== undefined
      ? { ...origDelivery, channels: ['telegram'] }
      : { channels: ['telegram'] };

  return {
    ...intent,
    meta: {
      ...intent.meta,
      source: 'telegram',
    },
    payload: {
      ...payload,
      recipient: redirectedRecipient,
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
