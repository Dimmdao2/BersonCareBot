/**
 * Support relay: типы сообщений для пересылки пользователь ↔ администратор.
 * Type-safe detector и константы без any.
 */

/** Поддерживаемые типы сообщений в relay (user↔admin). */
export const SUPPORT_RELAY_MESSAGE_TYPES = [
  'text',
  'photo',
  'document',
  'voice',
  'audio',
  'video',
  'video_note',
  'animation',
  'sticker',
  'contact',
  'location',
] as const;

export type SupportRelayMessageType = (typeof SUPPORT_RELAY_MESSAGE_TYPES)[number];

/** Минимальный shape входящего message из Telegram webhook (только поля, по которым определяем тип). */
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
 * Определяет тип сообщения по объекту message из Telegram webhook.
 * Порядок проверок: один тип на сообщение (приоритет как в Telegram: text последний среди медиа).
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

export function isSupportRelayMessageType(value: string): value is SupportRelayMessageType {
  return (SUPPORT_RELAY_MESSAGE_TYPES as readonly string[]).includes(value);
}
