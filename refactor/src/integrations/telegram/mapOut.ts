import type { OutgoingAction } from '../../domain/types.js';

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
