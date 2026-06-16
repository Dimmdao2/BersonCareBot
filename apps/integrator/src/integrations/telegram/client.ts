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
      api.sendMessage(p.chat_id, p.text, { reply_markup: p.reply_markup as never, parse_mode: p.parse_mode as never }),
    copyMessage: (p) =>
      api.copyMessage(p.chat_id, p.from_chat_id, p.message_id),
    editMessageText: (p) =>
      api.editMessageText(p.chat_id, p.message_id, p.text, { reply_markup: p.reply_markup as never, parse_mode: p.parse_mode as never }),
    editMessageReplyMarkup: (p) =>
      api.editMessageReplyMarkup(p.chat_id, p.message_id, { reply_markup: p.reply_markup as never }),
    deleteMessage: (p) => api.deleteMessage(p.chat_id, p.message_id),
    answerCallbackQuery: (p) =>
      api.answerCallbackQuery(p.callback_query_id, {
        ...(typeof p.text === 'string' && p.text.trim().length > 0 ? { text: p.text.trim() } : {}),
        ...(p.show_alert === true ? { show_alert: true } : {}),
      }),
  };
}
