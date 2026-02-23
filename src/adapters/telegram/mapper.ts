import type { IncomingUpdate, IncomingMessageUpdate, IncomingCallbackUpdate, OutgoingAction } from '../../core/types.js';
import type { TelegramWebhookBodyValidated } from './schema.js';

export const NOTIFY_KEYS = ['notify_toggle_spb', 'notify_toggle_msk', 'notify_toggle_online', 'notify_toggle_all'] as const;
export const MENU_NOTIFICATIONS = 'menu_notifications';
export const MENU_MY_BOOKINGS = 'menu_my_bookings';
export const MENU_BACK = 'menu_back';

export function isNotifyCallback(data: string): boolean {
  return data.startsWith('notify_');
}

export type FromTelegramContext = {
  userRow: { id: string; telegram_id: string } | null;
  telegramId: string | null;
  userState?: string | undefined;
  adminForward?: { chatId: number; text: string } | undefined;
};

/**
 * Map validated webhook body + context to internal IncomingUpdate.
 */
export function fromTelegram(
  body: TelegramWebhookBodyValidated,
  context: FromTelegramContext,
): IncomingUpdate | null {
  const { userRow, telegramId, userState = 'idle', adminForward } = context;

  if (body.callback_query) {
    const cq = body.callback_query;
    const chatId = cq.message?.chat?.id;
    const messageId = cq.message?.message_id;
    if (typeof chatId !== 'number' || typeof messageId !== 'number') return null;
    const update: IncomingCallbackUpdate = {
      kind: 'callback',
      chatId,
      messageId,
      telegramId: cq.from.id,
      callbackData: cq.data ?? '',
      callbackQueryId: cq.id,
    };
    return update;
  }

  if (body.message?.from && body.message.chat && typeof body.message.chat.id === 'number') {
    const msg = body.message;
    const chatId = msg.chat!.id;
    if (!telegramId) return null;
    const update: IncomingMessageUpdate = {
      kind: 'message',
      chatId,
      telegramId,
      text: msg.text ?? '',
      userRow,
      userState: userState ?? 'idle',
      ...(adminForward !== undefined && { adminForward }),
    };
    return update;
  }

  return null;
}

/** Minimal API shape for executing actions (grammy Bot.api). */
export type TelegramApi = {
  sendMessage(chatId: number, text: string, opts?: { reply_markup?: unknown }): Promise<unknown>;
  editMessageText(chatId: number, messageId: number, text: string, opts?: { reply_markup?: unknown }): Promise<unknown>;
  editMessageReplyMarkup(chatId: number, messageId: number, opts: { reply_markup: unknown }): Promise<unknown>;
  answerCallbackQuery(callbackQueryId: string): Promise<unknown>;
};

/**
 * Execute outgoing actions via Telegram API.
 */
export async function toTelegram(actions: OutgoingAction[], api: TelegramApi): Promise<void> {
  for (const a of actions) {
    switch (a.type) {
      case 'sendMessage':
        await api.sendMessage(a.chatId, a.text, { reply_markup: a.replyMarkup as never });
        break;
      case 'editMessageText':
        await api.editMessageText(a.chatId, a.messageId, a.text, { reply_markup: a.replyMarkup as never });
        break;
      case 'editMessageReplyMarkup':
        await api.editMessageReplyMarkup(a.chatId, a.messageId, { reply_markup: a.replyMarkup as never });
        break;
      case 'answerCallbackQuery':
        await api.answerCallbackQuery(a.callbackQueryId);
        break;
    }
  }
}
