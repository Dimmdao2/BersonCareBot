/**
 * Telegram Bot API adapter via grammy. Реализует MessagingPort для ядра.
 * Использует globalThis.fetch (в E2E/тестах его подменяют для мока).
 */
import { Bot } from 'grammy';
import type { ApiClientOptions } from 'grammy';
import type { MessagingPort } from '../../kernel/domain/ports/messaging.js';
import { telegramConfig } from './config.js';

function getBot(): Bot {
  return new Bot(telegramConfig.botToken, {
    client: { fetch: globalThis.fetch as unknown as NonNullable<ApiClientOptions['fetch']> },
  });
}

let botInstance: Bot | null = null;

export function getBotInstance(): Bot {
  if (!botInstance) botInstance = getBot();
  return botInstance;
}

export function createMessagingPort(): MessagingPort {
  const api = getBotInstance().api;
  return {
    sendMessage: (p) =>
      api.sendMessage(p.chat_id, p.text, { reply_markup: p.reply_markup as never }),
    editMessageText: (p) =>
      api.editMessageText(p.chat_id, p.message_id, p.text, { reply_markup: p.reply_markup as never }),
    editMessageReplyMarkup: (p) =>
      api.editMessageReplyMarkup(p.chat_id, p.message_id, { reply_markup: p.reply_markup as never }),
    answerCallbackQuery: (p) => api.answerCallbackQuery(p.callback_query_id),
  };
}
