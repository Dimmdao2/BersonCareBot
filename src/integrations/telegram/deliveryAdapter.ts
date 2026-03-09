import type { DeliveryAdapter, OutgoingIntent } from '../../kernel/contracts/index.js';
import { createMessagingPort } from './client.js';

type DeliveryPayload = {
  recipient?: { chatId?: unknown };
  message?: { text?: unknown };
  messageId?: unknown;
  callbackQueryId?: unknown;
  replyMarkup?: unknown;
  delivery?: { channels?: unknown };
} & Record<string, unknown>;

function readChannel(intent: OutgoingIntent): string {
  const payload = intent.payload as DeliveryPayload;
  const channels = payload.delivery?.channels;
  if (Array.isArray(channels)) {
    const normalized = channels.filter((item): item is string => typeof item === 'string');
    if (normalized.length > 0) return normalized[0] as string;
  }
  return 'smsc';
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

/** Coerces chatId to number; Telegram API accepts number, but interpolation may produce string. */
function asChatId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function createTelegramDeliveryAdapter(): DeliveryAdapter {
  let messagingPort: ReturnType<typeof createMessagingPort> | null = null;
  const getMessagingPort = (): ReturnType<typeof createMessagingPort> => {
    if (!messagingPort) messagingPort = createMessagingPort();
    return messagingPort;
  };

  return {
    canHandle(intent: OutgoingIntent): boolean {
      if (!['message.send', 'message.edit', 'message.replyMarkup.edit', 'callback.answer'].includes(intent.type)) {
        return false;
      }
      return intent.type === 'message.send'
        ? readChannel(intent) === 'telegram'
        : intent.meta.source === 'telegram';
    },
    async send(intent: OutgoingIntent): Promise<void> {
      const payload = intent.payload as DeliveryPayload;
      const rawChatId = payload.recipient?.chatId;
      const messageId = payload.messageId;
      const text = asNonEmptyString(payload.message?.text);
      // Structured logging: try to get reqLogger from intent.meta
      const reqLogger = (intent.meta as any)?.reqLogger;
      if (intent.type === 'message.send') {
        const chatId = asChatId(rawChatId);
        if (chatId === null || !text) {
          if (reqLogger) {
            reqLogger.error({ recipient: payload.recipient, intent }, '[telegram][deliveryAdapter] TELEGRAM_PAYLOAD_INVALID diagnostics');
          }
          const err = new Error('TELEGRAM_PAYLOAD_INVALID');
          (err as { code?: number }).code = 400;
          throw err;
        }
        await getMessagingPort().sendMessage({
          chat_id: chatId,
          text,
          reply_markup: payload.replyMarkup as never,
        });
        return;
      }

      if (intent.type === 'message.edit') {
        const chatId = asChatId(rawChatId);
        const numMessageId = typeof messageId === 'number' && Number.isFinite(messageId) ? messageId : (typeof messageId === 'string' ? Number(messageId) : NaN);
        if (chatId === null || !Number.isFinite(numMessageId) || !text) {
          const err = new Error('TELEGRAM_PAYLOAD_INVALID');
          (err as { code?: number }).code = 400;
          throw err;
        }
        await getMessagingPort().editMessageText({
          chat_id: chatId,
          message_id: numMessageId,
          text,
          reply_markup: payload.replyMarkup as never,
        });
        return;
      }

      if (intent.type === 'message.replyMarkup.edit') {
        const chatId = asChatId(rawChatId);
        const numMessageId = typeof messageId === 'number' && Number.isFinite(messageId) ? messageId : (typeof messageId === 'string' ? Number(messageId) : NaN);
        if (chatId === null || !Number.isFinite(numMessageId)) {
          const err = new Error('TELEGRAM_PAYLOAD_INVALID');
          (err as { code?: number }).code = 400;
          throw err;
        }
        await getMessagingPort().editMessageReplyMarkup({
          chat_id: chatId,
          message_id: numMessageId,
          reply_markup: payload.replyMarkup as never,
        });
        return;
      }

      const callbackQueryId = asNonEmptyString(payload.callbackQueryId);
      if (!callbackQueryId) {
        const err = new Error('TELEGRAM_PAYLOAD_INVALID');
        (err as { code?: number }).code = 400;
        throw err;
      }
      await getMessagingPort().answerCallbackQuery({ callback_query_id: callbackQueryId });
    },
  };
}
