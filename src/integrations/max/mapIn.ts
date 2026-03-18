import type { IncomingCallbackUpdate, IncomingMessageUpdate, IncomingUpdate } from '../../kernel/domain/types.js';
import type { MaxUpdateValidated } from './schema.js';
import { normalizeDynamicTelegramAction } from '../telegram/mapIn.js';

/** Map MAX button payload / text to internal action (e.g. for menu). */
const MESSAGE_TEXT_TO_ACTION: Record<string, string> = {
  '📅 Запись на приём': 'booking.open',
  'Запись на приём': 'booking.open',
  '⚙️ Меню': 'menu.more',
  'Меню': 'menu.more',
  '📓 Дневник': 'diary.open',
  'Дневник': 'diary.open',
};

function getActionFromText(text: string): string {
  const t = text?.trim() ?? '';
  return MESSAGE_TEXT_TO_ACTION[t] ?? '';
}

function getChatIdFromMessage(msg: MaxUpdateValidated['message']): number | null {
  if (!msg) return null;
  const r = msg.recipient;
  if (r?.chat_id != null && typeof r.chat_id === 'number') return r.chat_id;
  if (r?.user_id != null && typeof r.user_id === 'number') return r.user_id;
  const uid = msg.sender?.user_id;
  if (uid != null && typeof uid === 'number') return uid;
  return null;
}

function getUserIdFromMessage(msg: MaxUpdateValidated['message']): number | null {
  if (msg?.sender?.user_id != null) return msg.sender.user_id;
  return null;
}

/**
 * Maps validated MAX webhook/long-poll Update to internal IncomingUpdate.
 * Real payload: message.body.text, message.sender, message.recipient; callback.*.
 */
export function fromMax(body: MaxUpdateValidated): IncomingUpdate | null {
  if (body.update_type === 'message_callback' && body.callback) {
    const callbackId = body.callback.callback_id;
    const payload = typeof body.callback.payload === 'string' ? body.callback.payload : '';
    const userId = body.callback.user?.user_id;
    const chatId = getChatIdFromMessage(body.message) ?? userId ?? null;
    if (!callbackId || chatId === null || userId == null) return null;
    const normalized = normalizeDynamicTelegramAction(payload);
    const update: IncomingCallbackUpdate = {
      kind: 'callback',
      chatId,
      messageId: 0,
      channelUserId: userId,
      action: normalized.action,
      callbackData: normalized.action,
      callbackQueryId: callbackId,
      ...(typeof normalized.trackingId === 'string' ? { trackingId: normalized.trackingId } : {}),
      ...(typeof normalized.value === 'number' ? { value: normalized.value } : {}),
      ...(typeof normalized.entryType === 'string' ? { entryType: normalized.entryType } : {}),
      ...(typeof normalized.complexId === 'string' ? { complexId: normalized.complexId } : {}),
    };
    return update;
  }

  if (body.update_type === 'message_created' && body.message) {
    const msg = body.message;
    const text = msg.body?.text ?? '';
    const chatId = getChatIdFromMessage(msg);
    const userId = getUserIdFromMessage(msg);
    if (chatId === null || userId == null) return null;
    const update: IncomingMessageUpdate = {
      kind: 'message',
      chatId,
      channelId: String(userId),
      text,
      action: getActionFromText(text),
      userRow: null,
      userState: '',
    };
    return update;
  }

  if (body.update_type === 'bot_started') {
    const msg = body.message;
    const chatId = msg ? getChatIdFromMessage(msg) : (body.chat_id ?? body.user?.user_id ?? null);
    const userId = msg ? getUserIdFromMessage(msg) : (body.user?.user_id ?? null);
    if (chatId === null || userId == null) return null;
    const update: IncomingMessageUpdate = {
      kind: 'message',
      chatId,
      channelId: String(userId),
      text: '/start',
      action: '',
      userRow: null,
      userState: '',
    };
    return update;
  }

  if (body.update_type === 'user_added' && body.chat_id != null && body.user?.user_id != null) {
    const update: IncomingMessageUpdate = {
      kind: 'message',
      chatId: body.chat_id,
      channelId: String(body.user.user_id),
      text: '/start',
      action: '',
      userRow: null,
      userState: '',
    };
    return update;
  }

  return null;
}
