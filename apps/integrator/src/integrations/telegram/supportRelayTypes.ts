/**
 * Telegram-specific detector: maps Telegram message shape to support relay message type.
 * Type definitions and guard live in kernel/domain/supportRelay/messageTypes.
 */
import type { SupportRelayMessageType } from '../../kernel/domain/supportRelay/messageTypes.js';

/** Minimal shape of incoming message from Telegram webhook (fields used for type detection). */
export type TelegramMessageLike = {
  text?: string | undefined;
  photo?: unknown;
  document?: unknown;
  voice?: unknown;
  audio?: unknown;
  video?: unknown;
  video_note?: unknown;
  animation?: unknown;
  sticker?: unknown;
  contact?: unknown;
  location?: unknown;
};

/**
 * Detects relay message type from Telegram webhook message object.
 * One type per message; priority matches Telegram (e.g. photo before text/caption).
 */
export function getMessageTypeFromTelegramMessage(
  message: TelegramMessageLike | null | undefined,
): SupportRelayMessageType | null {
  if (!message || typeof message !== 'object') return null;

  if (Array.isArray(message.photo) && message.photo.length > 0) return 'photo';
  if (message.document != null) return 'document';
  if (message.voice != null) return 'voice';
  if (message.audio != null) return 'audio';
  if (message.video != null) return 'video';
  if (message.video_note != null) return 'video_note';
  if (message.animation != null) return 'animation';
  if (message.sticker != null) return 'sticker';
  if (message.contact != null) return 'contact';
  if (message.location != null) return 'location';

  if (typeof message.text === 'string') return 'text';

  return null;
}
