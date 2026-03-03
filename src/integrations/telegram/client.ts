/**
 * Telegram Bot API adapter via grammy. Реализует MessagingPort для ядра.
 * Использует globalThis.fetch (в E2E/тестах его подменяют для мока).
 */
import { Bot } from 'grammy';
import type { ApiClientOptions } from 'grammy';
import { env } from '../../config/env.js';
import type { MessagingPort } from '../../kernel/domain/ports/messaging.js';

function getBot(): Bot {
  const token = env.BOT_TOKEN;
  if (!token) throw new Error('BOT_TOKEN is not set');
  return new Bot(token, {
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
