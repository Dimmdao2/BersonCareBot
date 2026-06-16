/**
 * Telegram Bot API adapter via grammy. Реализует MessagingPort для ядра.
 * Использует globalThis.fetch (в E2E/тестах его подменяют для мока).
 *
 * SAFETY: All outgoing sends pass through applyTelegramRedirect() which, in
 * non-production environments, forcibly overrides chat_id to the configured
 * test recipient and prefixes the message body. This prevents developer
 * messages from ever reaching real patients. See shared/devDeliveryRedirect.ts.
 */
import { Bot } from 'grammy';
import type { ApiClientOptions } from 'grammy';
import type { MessagingPort } from '../../kernel/domain/ports/messaging.js';
import { telegramConfig } from './config.js';
import { applyTelegramRedirect } from '../../shared/devDeliveryRedirect.js';

// Minimal logger shim — replaced by a real import when the module is available;
// falls back to console.warn so the redirect still works in test environments
// where the logger module may not be initialised.
async function getWarnLogger(): Promise<{ warn(obj: Record<string, unknown>, msg: string): void }> {
  try {
    const { logger } = await import('../../infra/observability/logger.js');
    return logger;
  } catch {
    return { warn: (obj, msg) => console.warn('[warn]', msg, obj) };
  }
}

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
    sendMessage: async (p) => {
      const log = await getWarnLogger();
      const safe = applyTelegramRedirect({ ...p, chat_id: p.chat_id }, 'tg', log);
      return api.sendMessage(safe.chat_id, safe.text ?? p.text, { reply_markup: safe.reply_markup as never, parse_mode: safe.parse_mode as never });
    },
    copyMessage: async (p) => {
      const log = await getWarnLogger();
      // copyMessage copies content from another chat; in dev redirect the destination.
      // The source (from_chat_id/message_id) is unchanged — we are only guarding
      // where the copy is delivered, not where it comes from.
      const safe = applyTelegramRedirect({ chat_id: p.chat_id }, 'tg', log);
      return api.copyMessage(safe.chat_id, p.from_chat_id, p.message_id);
    },
    editMessageText: async (p) => {
      const log = await getWarnLogger();
      const safe = applyTelegramRedirect({ ...p, chat_id: p.chat_id }, 'tg', log);
      return api.editMessageText(safe.chat_id, safe.message_id, safe.text ?? p.text, { reply_markup: safe.reply_markup as never, parse_mode: safe.parse_mode as never });
    },
    editMessageReplyMarkup: async (p) => {
      const log = await getWarnLogger();
      const safe = applyTelegramRedirect({ chat_id: p.chat_id }, 'tg', log);
      return api.editMessageReplyMarkup(safe.chat_id, p.message_id, { reply_markup: p.reply_markup as never });
    },
    deleteMessage: async (p) => {
      const log = await getWarnLogger();
      const safe = applyTelegramRedirect({ chat_id: p.chat_id }, 'tg', log);
      return api.deleteMessage(safe.chat_id, p.message_id);
    },
    answerCallbackQuery: (p) =>
      api.answerCallbackQuery(p.callback_query_id, {
        ...(typeof p.text === 'string' && p.text.trim().length > 0 ? { text: p.text.trim() } : {}),
        ...(p.show_alert === true ? { show_alert: true } : {}),
      }),
  };
}
