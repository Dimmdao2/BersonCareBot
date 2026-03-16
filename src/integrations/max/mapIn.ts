import type { IncomingCallbackUpdate, IncomingMessageUpdate, IncomingUpdate } from '../../kernel/domain/types.js';
import type { MaxUpdateValidated } from './schema.js';

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

/**
 * Maps validated MAX webhook/long-poll Update to internal IncomingUpdate.
 * Returns null if the update type is not handled (e.g. bot_started without message).
 */
export function fromMax(body: MaxUpdateValidated): IncomingUpdate | null {
  if (body.update_type === 'message_callback') {
    const callbackId = body.callback_id;
    const payload = body.payload ?? '';
    const msg = body.message;
    if (!callbackId) return null;
    const chatId = msg?.chat_id ?? msg?.user_id;
    const messageId = msg?.id;
    const userId = msg?.from?.user_id ?? msg?.user_id;
    if (typeof chatId !== 'number' || typeof userId !== 'number') return null;
    const update: IncomingCallbackUpdate = {
      kind: 'callback',
      chatId,
      messageId: typeof messageId === 'number' ? messageId : 0,
      channelUserId: userId,
      action: payload,
      callbackData: payload,
      callbackQueryId: callbackId,
    };
    return update;
  }

  if (body.update_type === 'message_created' && body.message) {
    const msg = body.message;
    const text = msg.text ?? '';
    const chatId = msg.chat_id ?? msg.user_id;
    const userId = msg.from?.user_id ?? msg.user_id;
    if (typeof chatId !== 'number' || userId == null) return null;
    const update: IncomingMessageUpdate = {
      kind: 'message',
      chatId,
      channelId: String(userId),
      text,
      action: getActionFromText(text),
      userRow: null,
      userState: '',
    };
    if (typeof msg.id === 'number') update.messageId = msg.id;
    return update;
  }

  if (body.update_type === 'bot_started' && body.message) {
    const msg = body.message;
    const chatId = msg.chat_id ?? msg.user_id;
    const userId = msg.from?.user_id ?? msg.user_id;
    if (typeof chatId !== 'number' || userId == null) return null;
    const update: IncomingMessageUpdate = {
      kind: 'message',
      chatId,
      channelId: String(userId),
      text: '/start',
      action: '',
      userRow: null,
      userState: '',
    };
    if (typeof msg.id === 'number') update.messageId = msg.id;
    return update;
  }

  return null;
}
