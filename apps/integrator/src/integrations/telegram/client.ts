/**
 * Telegram Bot API adapter via grammy. Реализует MessagingPort для ядра.
 * Использует globalThis.fetch (в E2E/тестах его подменяют для мока).
 */
import { Bot } from 'grammy';
import type { ApiClientOptions } from 'grammy';
import type { MessagingPort } from '../../kernel/domain/ports/messaging.js';
import { getTelegramRuntimeConfig } from '../../infra/adapters/integrationRuntimeConfig.js';

function getBot(botToken: string): Bot {
  return new Bot(botToken, {
    client: { fetch: globalThis.fetch as unknown as NonNullable<ApiClientOptions['fetch']> },
  });
}

let botInstance: { token: string; bot: Bot } | null = null;

export async function getBotInstance(): Promise<Bot> {
  const config = await getTelegramRuntimeConfig();
  if (!config.enabled) throw new Error('TELEGRAM_RUNTIME_CONFIG_UNAVAILABLE');
  if (botInstance?.token !== config.botToken) {
    botInstance = { token: config.botToken, bot: getBot(config.botToken) };
  }
  return botInstance.bot;
}

export function createMessagingPort(botToken?: string): MessagingPort {
  const getApi = async () => (botToken ? getBot(botToken).api : (await getBotInstance()).api);
  return {
    sendMessage: async (p) =>
      (await getApi()).sendMessage(p.chat_id, p.text, {
        reply_markup: p.reply_markup as never,
        parse_mode: p.parse_mode as never,
      }),
    sendPhoto: async (p) =>
      (await getApi()).sendPhoto(p.chat_id, p.photo, {
        ...(p.caption !== undefined ? { caption: p.caption } : {}),
        parse_mode: p.parse_mode as never,
        reply_markup: p.reply_markup as never,
      }),
    copyMessage: async (p) => (await getApi()).copyMessage(p.chat_id, p.from_chat_id, p.message_id),
    editMessageText: async (p) =>
      (await getApi()).editMessageText(p.chat_id, p.message_id, p.text, {
        reply_markup: p.reply_markup as never,
        parse_mode: p.parse_mode as never,
      }),
    editMessageReplyMarkup: async (p) =>
      (await getApi()).editMessageReplyMarkup(p.chat_id, p.message_id, {
        reply_markup: p.reply_markup as never,
      }),
    deleteMessage: async (p) => (await getApi()).deleteMessage(p.chat_id, p.message_id),
    answerCallbackQuery: async (p) =>
      (await getApi()).answerCallbackQuery(p.callback_query_id, {
        ...(typeof p.text === 'string' && p.text.trim().length > 0 ? { text: p.text.trim() } : {}),
        ...(p.show_alert === true ? { show_alert: true } : {}),
      }),
  };
}
