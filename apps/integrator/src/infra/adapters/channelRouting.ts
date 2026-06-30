/**
 * Shared channel-routing helpers (PLAN S2 / D4).
 *
 * Canonical single `readChannel` definition for the integrator send module.
 * All adapters and dispatchPort import from here; per-file local copies are deleted (D4).
 *
 * Routing decisions are byte-identical to the originals:
 * - `readChannel`          : prefer `payload.delivery.channels[0]`, then `meta.source` (null if absent)
 * - `readChannelWithDefault`: same, with an explicit per-adapter fallback (e.g. smsc adapter → 'smsc')
 * - `readChannelStrict`    : throws CHANNEL_NOT_SPECIFIED rather than returning null
 * - `messageToIntent`      : maps UnifiedOutgoingMessage → legacy OutgoingIntent JSON (same shape as
 *                            reportOperatorFailure.ts hand-rolled intents and relayOutboundRoute.buildIntent)
 */
import type { OutgoingIntent, OutgoingIntentType } from '../../kernel/contracts/events.js';
import type { UnifiedOutgoingMessage } from '../../kernel/contracts/unifiedMessage.js';

type DeliveryPayload = {
  delivery?: { channels?: unknown };
} & Record<string, unknown>;

/**
 * Reads the channel from an intent.
 *
 * For `message.send`: prefers `payload.delivery.channels[0]`, falls back to `meta.source`.
 * For other intent types: returns `meta.source` (or null if absent).
 * Returns `null` when the channel cannot be determined.
 *
 * This is the canonical implementation replacing identical local copies in
 * dispatchPort.ts:37, max/deliveryAdapter.ts:46. (D4)
 */
export function readChannel(intent: OutgoingIntent): string | null {
  if (intent.type !== 'message.send') return intent.meta.source || null;
  const payload = intent.payload as DeliveryPayload;
  const channels = payload.delivery?.channels;
  if (Array.isArray(channels)) {
    const normalized = channels.filter((item): item is string => typeof item === 'string');
    if (normalized.length > 0) return normalized[0] as string;
  }
  return intent.meta?.source ?? null;
}

/**
 * Reads the channel with an explicit per-adapter default fallback.
 *
 * Use `readChannelWithDefault(intent, 'smsc')` in smscDeliveryAdapter and
 * `readChannelWithDefault(intent, 'smsc')` in telegramDeliveryAdapter (their
 * original local copies fell back to `'smsc'` when no channel was found —
 * preserved exactly, D4).
 *
 * For other adapters that previously fell back to `meta.source` (or null),
 * use `readChannel(intent)` directly.
 *
 * Treats any falsy result from `readChannel` (null or empty string) as
 * "no channel" and applies the fallback, matching the original `return 'smsc'`
 * behaviour of both telegram and smsc adapter local copies.
 */
export function readChannelWithDefault(intent: OutgoingIntent, fallback: string): string {
  const ch = readChannel(intent);
  return ch || fallback;
}

/**
 * Reads the channel and throws `CHANNEL_NOT_SPECIFIED` if it cannot be determined.
 * Use in paths that must fail loudly when a channel is missing (e.g., the dispatch
 * port's main dispatch loop, or strict validation contexts).
 */
export function readChannelStrict(intent: OutgoingIntent): string {
  const ch = readChannel(intent);
  if (!ch) throw new Error('CHANNEL_NOT_SPECIFIED');
  return ch;
}

/**
 * Maps a `UnifiedOutgoingMessage` → legacy `OutgoingIntent` JSON.
 *
 * The produced shape matches exactly what current hand-rolled call sites produce:
 * - reportOperatorFailure.ts (telegram branch, ~line 90): { type, meta, payload:{recipient:{chatId}, message:{text}, delivery:{channels,maxAttempts}} }
 * - relayOutboundRoute.buildIntent: { type, meta, payload:{recipient:{chatId|userId|phoneNormalized}, message:{text}, delivery:{channels}} }
 *
 * The `channel` tag goes into `payload.delivery.channels[0]` (canonical wire location, D2).
 * For `smsc`, the telegram/max adapters still need `chatId`/`userId`; for smsc the phoneNormalized.
 * All extra UnifiedContent fields (html, subject, url, pushExtras, replyMarkup, parse_mode,
 * fromOverride) are forwarded into `payload` so future adapters can read them.
 */
export function messageToIntent(msg: UnifiedOutgoingMessage): OutgoingIntent {
  const type: OutgoingIntentType = msg.kind;

  // Build the recipient sub-object — include all non-undefined recipient fields.
  const recipient: Record<string, unknown> = {};
  if (msg.recipient.chatId !== undefined) recipient.chatId = msg.recipient.chatId;
  if (msg.recipient.userId !== undefined) recipient.userId = msg.recipient.userId;
  if (msg.recipient.phoneNormalized !== undefined) recipient.phoneNormalized = msg.recipient.phoneNormalized;
  if (msg.recipient.email !== undefined) recipient.email = msg.recipient.email;
  if (msg.recipient.pushUserId !== undefined) recipient.pushUserId = msg.recipient.pushUserId;

  // Build the message sub-object for channels that use text.
  const message: Record<string, unknown> = {};
  if (msg.content.text !== undefined) message.text = msg.content.text;

  // Build the delivery sub-object.
  const delivery: Record<string, unknown> = {
    channels: [msg.channel],
  };
  if (msg.delivery?.maxAttempts !== undefined) delivery.maxAttempts = msg.delivery.maxAttempts;

  // Build the full payload — include all content extras so adapters can read them.
  const payload: Record<string, unknown> = {
    recipient,
    delivery,
  };
  if (Object.keys(message).length > 0) payload.message = message;
  if (msg.content.replyMarkup !== undefined) payload.replyMarkup = msg.content.replyMarkup;
  if (msg.content.parse_mode !== undefined) payload.parse_mode = msg.content.parse_mode;
  if (msg.content.title !== undefined) payload.title = msg.content.title;
  // Forward content.subject separately so the email adapter reads payload.subject (not payload.title).
  // This is the contract fix for S9: email subject is the single source of truth via content.subject.
  if (msg.content.subject !== undefined) payload.subject = msg.content.subject;
  if (msg.content.url !== undefined) payload.url = msg.content.url;
  if (msg.content.html !== undefined) payload.html = msg.content.html;
  if (msg.content.fromOverride !== undefined) payload.fromOverride = msg.content.fromOverride;
  if (msg.content.pushExtras !== undefined) payload.pushExtras = msg.content.pushExtras;

  return {
    type,
    meta: msg.meta,
    payload,
  };
}
