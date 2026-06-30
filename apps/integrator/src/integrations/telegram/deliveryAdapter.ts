import type { DeliveryAdapter, DeliverySendResult, OutgoingIntent } from '../../kernel/contracts/index.js';
import { classifyTelegramRecipientBlockedError } from '../../infra/delivery/recipientBotBlocked.js';
import { createMessagingPort } from './client.js';
import { readChannelWithDefault } from '../../infra/adapters/channelRouting.js';

type RequestLoggerLike = {
  error: (obj: Record<string, unknown>, message: string) => void;
};

const TELEGRAM_CALLBACK_DATA_MAX_BYTES = 64;

type DeliveryPayload = {
  recipient?: { chatId?: unknown };
  message?: { text?: unknown };
  messageId?: unknown;
  callbackQueryId?: unknown;
  replyMarkup?: unknown;
  parse_mode?: 'HTML' | 'Markdown';
  imageUrl?: unknown;
  delivery?: { channels?: unknown };
} & Record<string, unknown>;


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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTelegramCallbackDataValid(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const bytes = Buffer.byteLength(value, 'utf8');
  return bytes > 0 && bytes <= TELEGRAM_CALLBACK_DATA_MAX_BYTES;
}

/**
 * Telegram returns BUTTON_DATA_INVALID when callback_data is missing/invalid or longer than 64 bytes.
 * To keep delivery resilient, we drop only broken inline buttons and send the rest.
 */
function sanitizeTelegramReplyMarkup(replyMarkup: unknown): unknown {
  if (!isRecord(replyMarkup)) return replyMarkup;
  const inlineKeyboardRaw = replyMarkup.inline_keyboard;
  if (!Array.isArray(inlineKeyboardRaw)) return replyMarkup;

  let mutated = false;
  const inline_keyboard = inlineKeyboardRaw
    .map((row) => {
      if (!Array.isArray(row)) {
        mutated = true;
        return [];
      }
      const nextRow = row.filter((button) => {
        if (!isRecord(button)) {
          mutated = true;
          return false;
        }
        if (!('callback_data' in button)) return true;
        const valid = isTelegramCallbackDataValid(button.callback_data);
        if (!valid) mutated = true;
        return valid;
      });
      if (nextRow.length !== row.length) mutated = true;
      return nextRow;
    })
    .filter((row) => row.length > 0);

  if (!mutated) return replyMarkup;
  return { ...replyMarkup, inline_keyboard };
}

async function withTelegramBlockedDetection<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const blocked = classifyTelegramRecipientBlockedError(err);
    if (blocked) throw blocked;
    throw err;
  }
}

export function createTelegramDeliveryAdapter(): DeliveryAdapter {
  let messagingPort: ReturnType<typeof createMessagingPort> | null = null;
  const getMessagingPort = (): ReturnType<typeof createMessagingPort> => {
    if (!messagingPort) messagingPort = createMessagingPort();
    return messagingPort;
  };

  return {
    canHandle(intent: OutgoingIntent): boolean {
      if (!['message.send', 'message.copy', 'message.edit', 'message.replyMarkup.edit', 'message.delete', 'callback.answer'].includes(intent.type)) {
        return false;
      }
      if (intent.type === 'message.send' || intent.type === 'message.copy') {
        // Falls back to 'smsc' (the original adapter default, D4 — preserved exactly).
        return readChannelWithDefault(intent, 'smsc') === 'telegram';
      }
      return intent.meta.source === 'telegram';
    },
    async send(intent: OutgoingIntent): Promise<DeliverySendResult> {
      const payload = intent.payload as DeliveryPayload;
      const rawChatId = payload.recipient?.chatId;
      const messageId = payload.messageId;
      const text = asNonEmptyString(payload.message?.text);
      const reqLogger = (intent.meta as { reqLogger?: RequestLoggerLike }).reqLogger;
      if (intent.type === 'message.send') {
        const chatId = asChatId(rawChatId);
        const replyMarkup = sanitizeTelegramReplyMarkup(payload.replyMarkup);
        const imageUrl = asNonEmptyString(payload.imageUrl);
        if (chatId === null || !text) {
          if (reqLogger) {
            reqLogger.error({ recipient: payload.recipient, intent }, '[telegram][deliveryAdapter] TELEGRAM_PAYLOAD_INVALID diagnostics');
          }
          const err = new Error('TELEGRAM_PAYLOAD_INVALID');
          (err as { code?: number }).code = 400;
          throw err;
        }
        const extractMessageId = (sent: unknown): number | undefined => {
          const midRaw = (sent as { message_id?: unknown })?.message_id;
          return typeof midRaw === 'number' && Number.isFinite(midRaw) ? midRaw : undefined;
        };
        const sendPlainText = async (): Promise<DeliverySendResult> => {
          const sent = await getMessagingPort().sendMessage({
            chat_id: chatId,
            text,
            reply_markup: replyMarkup as never,
            ...(payload.parse_mode ? { parse_mode: payload.parse_mode } : {}),
          });
          const telegramMessageId = extractMessageId(sent);
          return telegramMessageId !== undefined ? { telegramMessageId } : {};
        };
        if (imageUrl) {
          // Telegram photo caption max is 1024 chars. Lossless: caption when it fits,
          // otherwise photo (no caption) + a follow-up text message carrying the full body.
          const TELEGRAM_CAPTION_MAX = 1024;
          return withTelegramBlockedDetection(async () => {
            try {
              const sentPhoto = await getMessagingPort().sendPhoto({
                chat_id: chatId,
                photo: imageUrl,
                ...(text.length <= TELEGRAM_CAPTION_MAX ? { caption: text } : {}),
                reply_markup: replyMarkup as never,
                ...(payload.parse_mode ? { parse_mode: payload.parse_mode } : {}),
              });
              if (text.length > TELEGRAM_CAPTION_MAX) {
                await getMessagingPort().sendMessage({
                  chat_id: chatId,
                  text,
                  ...(payload.parse_mode ? { parse_mode: payload.parse_mode } : {}),
                });
              }
              const telegramMessageId = extractMessageId(sentPhoto);
              return telegramMessageId !== undefined ? { telegramMessageId } : {};
            } catch (photoErr) {
              // Photo send failed (e.g. Telegram could not fetch the URL). Re-throw if the
              // recipient blocked the bot; otherwise fall back to text-only so the broadcast
              // still delivers.
              const blocked = classifyTelegramRecipientBlockedError(photoErr);
              if (blocked) throw blocked;
              return sendPlainText();
            }
          });
        }
        return withTelegramBlockedDetection(sendPlainText);
      }

      if (intent.type === 'message.copy') {
        const chatId = asChatId(payload.recipient?.chatId ?? payload.chat_id);
        const fromChatId = asChatId(payload.from_chat_id);
        const msgId = typeof payload.message_id === 'number' && Number.isFinite(payload.message_id)
          ? payload.message_id
          : (typeof payload.message_id === 'string' ? Number(payload.message_id) : NaN);
        if (chatId === null || fromChatId === null || !Number.isFinite(msgId)) {
          const err = new Error('TELEGRAM_PAYLOAD_INVALID');
          (err as { code?: number }).code = 400;
          throw err;
        }
        await withTelegramBlockedDetection(() =>
          getMessagingPort().copyMessage({
            chat_id: chatId,
            from_chat_id: fromChatId,
            message_id: msgId,
          }),
        );
        return {};
      }

      if (intent.type === 'message.edit') {
        const chatId = asChatId(rawChatId);
        const replyMarkup = sanitizeTelegramReplyMarkup(payload.replyMarkup);
        const numMessageId = typeof messageId === 'number' && Number.isFinite(messageId) ? messageId : (typeof messageId === 'string' ? Number(messageId) : NaN);
        if (chatId === null || !Number.isFinite(numMessageId) || !text) {
          const err = new Error('TELEGRAM_PAYLOAD_INVALID');
          (err as { code?: number }).code = 400;
          throw err;
        }
        await withTelegramBlockedDetection(() =>
          getMessagingPort().editMessageText({
            chat_id: chatId,
            message_id: numMessageId,
            text,
            reply_markup: replyMarkup as never,
            ...(payload.parse_mode ? { parse_mode: payload.parse_mode } : {}),
          }),
        );
        return {};
      }

      if (intent.type === 'message.replyMarkup.edit') {
        const chatId = asChatId(rawChatId);
        const replyMarkup = sanitizeTelegramReplyMarkup(payload.replyMarkup);
        const numMessageId = typeof messageId === 'number' && Number.isFinite(messageId) ? messageId : (typeof messageId === 'string' ? Number(messageId) : NaN);
        if (chatId === null || !Number.isFinite(numMessageId)) {
          const err = new Error('TELEGRAM_PAYLOAD_INVALID');
          (err as { code?: number }).code = 400;
          throw err;
        }
        await withTelegramBlockedDetection(() =>
          getMessagingPort().editMessageReplyMarkup({
            chat_id: chatId,
            message_id: numMessageId,
            reply_markup: replyMarkup as never,
          }),
        );
        return {};
      }

      if (intent.type === 'message.delete') {
        const chatId = asChatId(rawChatId);
        const numMessageId = typeof messageId === 'number' && Number.isFinite(messageId) ? messageId : (typeof messageId === 'string' ? Number(messageId) : NaN);
        if (chatId === null || !Number.isFinite(numMessageId)) {
          const err = new Error('TELEGRAM_PAYLOAD_INVALID');
          (err as { code?: number }).code = 400;
          throw err;
        }
        await withTelegramBlockedDetection(() =>
          getMessagingPort().deleteMessage({ chat_id: chatId, message_id: numMessageId }),
        );
        return {};
      }

      const callbackQueryId = asNonEmptyString(payload.callbackQueryId);
      if (!callbackQueryId) {
        const err = new Error('TELEGRAM_PAYLOAD_INVALID');
        (err as { code?: number }).code = 400;
        throw err;
      }
      const toast = asNonEmptyString(payload.text);
      await withTelegramBlockedDetection(() =>
        getMessagingPort().answerCallbackQuery({
          callback_query_id: callbackQueryId,
          ...(toast ? { text: toast } : {}),
          ...(payload.show_alert === true ? { show_alert: true } : {}),
        }),
      );
      return {};
    },
  };
}
