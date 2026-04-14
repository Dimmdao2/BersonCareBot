import type { DeliveryAdapter, OutgoingIntent } from '../../kernel/contracts/index.js';
import type { AttachmentRequest, Button } from '@maxhub/max-bot-api/types';
import * as maxClient from './client.js';
import { getMaxApiKey } from './runtimeConfig.js';

/**
 * MAX Platform API: `open_app` открывает мини-приложение внутри клиента (MAX Bridge + initData).
 * Схема полей: `schemes.OpenAppButton` в max-bot-api-client-go (`type`, `text`, `web_app`, `payload?`, `contact_id?`).
 * SDK `@maxhub/max-bot-api@0.2.2` в типе `Button` этого варианта ещё не содержит — отправляем JSON как в API.
 */
export type MaxOpenAppButtonPayload = {
  type: 'open_app';
  text: string;
  /** URL мини-приложения (как в Telegram `web_app.url`). */
  web_app: string;
  payload?: string;
  contact_id?: number;
};

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

/** MAX user id for `open_app.contact_id` (initData / login context). */
function parseMaxPlatformUserId(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim());
  return undefined;
}

/**
 * Prefer `meta.userId`; fallback to `recipient.chatId` (DM: same id; jobs may omit meta.userId).
 */
function maxContactIdForOpenApp(intent: OutgoingIntent, payload: DeliveryPayload): number | undefined {
  const fromMeta = parseMaxPlatformUserId(intent.meta?.userId);
  if (fromMeta !== undefined) return fromMeta;
  return parseMaxPlatformUserId(payload.recipient?.chatId);
}

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

type TelegramStyleKeyboardRow = Array<{
  text?: string;
  callback_data?: string;
  url?: string;
  web_app?: { url?: string };
  request_contact?: boolean;
}>;

/**
 * Convert Telegram-style `reply_markup` to MAX `inline_keyboard` attachment.
 * - Merges **`inline_keyboard`** and **`keyboard`** (reply keyboard) rows — MAX only has inline attachments.
 * - `web_app` → **`open_app`** (мини-приложение в клиенте MAX, не внешний браузер).
 * - `url` → `link` (обычная ссылка).
 * - `request_contact` — как в API MAX.
 */
function toMaxInlineKeyboard(
  replyMarkup: unknown,
  opts?: { contactId?: number },
): AttachmentRequest[] | undefined {
  const rm = replyMarkup as {
    inline_keyboard?: TelegramStyleKeyboardRow[];
    keyboard?: TelegramStyleKeyboardRow[];
  } | null;
  const rows: TelegramStyleKeyboardRow[] = [];
  if (rm?.inline_keyboard?.length) rows.push(...rm.inline_keyboard);
  if (rm?.keyboard?.length) rows.push(...rm.keyboard);
  if (rows.length === 0) return undefined;
  const buttons = rows.map((row) =>
    row.map((btn): Button | MaxOpenAppButtonPayload => {
      if (btn.request_contact === true) {
        return { type: 'request_contact', text: btn.text ?? 'Поделиться номером' } as Button;
      }
      const webAppUrl = typeof btn.web_app?.url === 'string' ? btn.web_app.url.trim() : '';
      if (webAppUrl.length > 0) {
        const open: MaxOpenAppButtonPayload = {
          type: 'open_app',
          text: btn.text ?? '',
          web_app: webAppUrl,
        };
        const cid = opts?.contactId;
        if (cid !== undefined && Number.isFinite(cid)) {
          open.contact_id = Math.trunc(cid);
        }
        return open;
      }
      if (btn.url) return { type: 'link', text: btn.text ?? '', url: btn.url };
      return { type: 'callback', text: btn.text ?? '', payload: btn.callback_data ?? '' };
    }),
  );
  return [
    {
      type: 'inline_keyboard',
      payload: { buttons: buttons as unknown as Button[][] },
    },
  ];
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
        const sendContactId = maxContactIdForOpenApp(intent, payload);
        const attachments = toMaxInlineKeyboard(
          payload.replyMarkup,
          sendContactId !== undefined ? { contactId: sendContactId } : undefined,
        );
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
        const editContactId = maxContactIdForOpenApp(intent, payload);
        const attachments = toMaxInlineKeyboard(
          payload.replyMarkup,
          editContactId !== undefined ? { contactId: editContactId } : undefined,
        );
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
        const markupContactId = maxContactIdForOpenApp(intent, payload);
        const attachments = toMaxInlineKeyboard(
          payload.replyMarkup,
          markupContactId !== undefined ? { contactId: markupContactId } : undefined,
        );
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
