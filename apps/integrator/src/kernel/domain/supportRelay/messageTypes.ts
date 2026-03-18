/**
 * Transport-agnostic message type names for support relay (user ↔ admin).
 * Used by config and policy; concrete transport (e.g. Telegram) maps its payload to these types.
 */

/** Supported message type names in relay. */
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

export function isSupportRelayMessageType(value: string): value is SupportRelayMessageType {
  return (SUPPORT_RELAY_MESSAGE_TYPES as readonly string[]).includes(value);
}
