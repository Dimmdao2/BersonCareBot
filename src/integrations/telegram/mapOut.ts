import type { OutgoingAction } from '../../kernel/domain/types.js';

/** Minimal API shape for executing actions (grammy Bot.api). */
export type TelegramApi = {
  sendMessage(chatId: number, text: string, opts?: { reply_markup?: unknown }): Promise<unknown>;
  editMessageText(chatId: number, messageId: number, text: string, opts?: { reply_markup?: unknown }): Promise<unknown>;
  editMessageReplyMarkup(chatId: number, messageId: number, opts: { reply_markup: unknown }): Promise<unknown>;
  answerCallbackQuery(callbackQueryId: string): Promise<unknown>;
};

function asTelegramMessageId(value: number | string): number {
  const messageId = typeof value === 'number' && Number.isFinite(value) ? value : Number(value);
  if (!Number.isFinite(messageId)) throw new Error('TELEGRAM_MESSAGE_ID_INVALID');
  return messageId;
}

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
        await api.editMessageText(a.chatId, asTelegramMessageId(a.messageId), a.text, { reply_markup: a.replyMarkup as never });
        break;
      case 'editMessageReplyMarkup':
        await api.editMessageReplyMarkup(a.chatId, asTelegramMessageId(a.messageId), { reply_markup: a.replyMarkup as never });
        break;
      case 'answerCallbackQuery':
        await api.answerCallbackQuery(a.callbackQueryId);
        break;
    }
  }
}
