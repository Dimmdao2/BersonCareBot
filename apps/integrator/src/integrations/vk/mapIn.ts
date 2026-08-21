import type { IncomingUpdate } from '../../kernel/domain/types.js';
import { normalizeChannelCallbackPayload } from '../telegram/mapIn.js';
import type { VkCallback, VkMessage, VkMessageEvent } from './schema.js';

function messageType(message: VkMessage): string { return Array.isArray(message.attachments) && message.attachments.length > 0 ? 'unsupported' : 'text'; }
function callbackPayload(raw: VkMessageEvent['payload']): string { return typeof raw === 'string' ? raw : raw && typeof raw === 'object' ? JSON.stringify(raw) : ''; }

/** Converts only documented `message_new` and `message_event` Callback payloads. */
export function fromVk(callback: VkCallback): IncomingUpdate | null {
  if (callback.type === 'message_new') {
    const message = callback.object as VkMessage | undefined;
    if (!message) return null;
    return {
      kind: 'message', chatId: message.peer_id, channelId: String(message.from_id),
      ...(typeof message.id === 'number' ? { messageId: message.id } : {}),
      text: message.text ?? '', relayMessageType: messageType(message), userRow: null, userState: '',
    };
  }
  if (callback.type === 'message_event') {
    const event = callback.object as VkMessageEvent | undefined;
    if (!event) return null;
    const payload = callbackPayload(event.payload);
    const normalized = normalizeChannelCallbackPayload(payload);
    return {
      kind: 'callback',
      chatId: event.peer_id,
      messageId: event.conversation_message_id ?? event.event_id,
      channelUserId: event.user_id,
      action: normalized.action,
      callbackData: normalized.action,
      callbackQueryId: `${event.event_id}:${event.user_id}:${event.peer_id}`,
      ...(normalized.conversationId ? { conversationId: normalized.conversationId } : {}),
      ...(normalized.reminderOccurrenceId
        ? { reminderOccurrenceId: normalized.reminderOccurrenceId }
        : {}),
      ...(normalized.reminderSnoozeMinutes !== undefined
        ? { reminderSnoozeMinutes: normalized.reminderSnoozeMinutes }
        : {}),
      ...(normalized.reminderMuteMinutes !== undefined
        ? { reminderMuteMinutes: normalized.reminderMuteMinutes }
        : {}),
      ...(normalized.reminderMutePreset ? { reminderMutePreset: normalized.reminderMutePreset } : {}),
    };
  }
  return null;
}
