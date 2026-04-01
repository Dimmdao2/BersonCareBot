import type { DeliveryAdapter, OutgoingIntent } from '../../kernel/contracts/index.js';
import type { AttachmentRequest, Button } from '@maxhub/max-bot-api/types';
import * as maxClient from './client.js';
import { getMaxApiKey } from './runtimeConfig.js';

type DeliveryPayload = {
  recipient?: { chatId?: unknown };
  message?: { text?: unknown };
  messageId?: unknown;
  callbackQueryId?: unknown;
  notification?: unknown;
  replyMarkup?: unknown;
  parse_mode?: string;
  delivery?: { channels?: unknown };
} & Record<string, unknown>;

function readChannel(intent: OutgoingIntent): string | null {
  if (intent.type !== 'message.send') return intent.meta.source || null;
  const payload = intent.payload as DeliveryPayload;
  const channels = payload.delivery?.channels;
  if (Array.isArray(channels)) {
    const normalized = channels.filter((item): item is string => typeof item === 'string');
    if (normalized.length > 0) return normalized[0] as string;
  }
  return intent.meta?.source ?? null;
}

function asChatId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

/**
 * Convert Telegram-style reply_markup.inline_keyboard to MAX inline_keyboard attachment.
 */
function toMaxInlineKeyboard(replyMarkup: unknown): AttachmentRequest[] | undefined {
  const rm = replyMarkup as { inline_keyboard?: Array<Array<{ text?: string; callback_data?: string; url?: string }>> } | null;
  if (!rm?.inline_keyboard?.length) return undefined;
  const buttons: Button[][] = rm.inline_keyboard.map((row) =>
    row.map((btn): Button => {
      if (btn.url) return { type: 'link', text: btn.text ?? '', url: btn.url };
      return { type: 'callback', text: btn.text ?? '', payload: btn.callback_data ?? '' };
    }),
  );
  return [{ type: 'inline_keyboard', payload: { buttons } }];
}

export function createMaxDeliveryAdapter(): DeliveryAdapter {
  return {
    canHandle(intent: OutgoingIntent): boolean {
      if (intent.type === 'message.send') return readChannel(intent) === 'max';
      if (intent.type === 'message.edit') return intent.meta.source === 'max';
      if (intent.type === 'message.replyMarkup.edit') return intent.meta.source === 'max';
      if (intent.type === 'callback.answer') return intent.meta.source === 'max';
      return false;
    },
    async send(intent: OutgoingIntent): Promise<void> {
      const apiKey = await getMaxApiKey();
      if (!apiKey) throw new Error('max api key missing');
      const config = { apiKey };
      const payload = intent.payload as DeliveryPayload;
      const text = asNonEmptyString(payload.message?.text);
      const rawChatId = payload.recipient?.chatId;
      const messageId = payload.messageId;

      if (intent.type === 'message.send') {
        const chatId = asChatId(rawChatId);
        if (chatId === null || !text) {
          throw new Error('MAX_PAYLOAD_INVALID: recipient.chatId and message.text required');
        }
        const attachments = toMaxInlineKeyboard(payload.replyMarkup);
        const result = await maxClient.sendMaxMessage(config, {
          chatId,
          text,
          extra: {
            ...(payload.parse_mode === 'HTML' ? { format: 'html' as const } : {}),
            ...(attachments?.length ? { attachments } : {}),
          },
        });
        if (!result) throw new Error('MAX_SEND_FAILED');
        return;
      }

      if (intent.type === 'message.edit') {
        const stringMessageId = asNonEmptyString(messageId) ?? (typeof messageId === 'number' && Number.isFinite(messageId) ? String(messageId) : null);
        if (!stringMessageId || !text) {
          throw new Error('MAX_PAYLOAD_INVALID: messageId and message.text required for edit');
        }
        const attachments = toMaxInlineKeyboard(payload.replyMarkup);
        const result = await maxClient.editMaxMessage(config, {
          messageId: stringMessageId,
          extra: {
            text,
            ...(payload.parse_mode === 'HTML' ? { format: 'html' as const } : {}),
            ...(attachments?.length ? { attachments } : {}),
          },
        });
        if (!result) throw new Error('MAX_EDIT_FAILED');
        return;
      }

      if (intent.type === 'message.replyMarkup.edit') {
        const stringMessageId = asNonEmptyString(messageId) ?? (typeof messageId === 'number' && Number.isFinite(messageId) ? String(messageId) : null);
        if (!stringMessageId) {
          throw new Error('MAX_PAYLOAD_INVALID: messageId required for replyMarkup edit');
        }
        const attachments = toMaxInlineKeyboard(payload.replyMarkup);
        const result = await maxClient.editMaxMessage(config, {
          messageId: stringMessageId,
          extra: {
            ...(attachments?.length ? { attachments } : { attachments: [] }),
          },
        });
        if (!result) throw new Error('MAX_EDIT_FAILED');
        return;
      }

      if (intent.type === 'callback.answer') {
        const callbackQueryId = asNonEmptyString(payload.callbackQueryId);
        if (!callbackQueryId) throw new Error('MAX_PAYLOAD_INVALID: callbackQueryId required');
        const notification = asNonEmptyString(payload.notification) ?? 'OK';
        const result = await maxClient.answerMaxCallback(config, {
          callbackId: callbackQueryId,
          extra: { notification },
        });
        if (!result) throw new Error('MAX_CALLBACK_ANSWER_FAILED');
      }
    },
  };
}
