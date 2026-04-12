import type { IncomingCallbackUpdate, IncomingMessageUpdate, IncomingUpdate } from '../../kernel/domain/types.js';
import type { MaxUpdateValidated } from './schema.js';
import type { SupportRelayMessageType } from '../../kernel/domain/supportRelay/messageTypes.js';
import { normalizeDynamicTelegramAction, normalizeTelegramContactPhone } from '../telegram/mapIn.js';

/** Map MAX button payload / text to internal action (e.g. for menu). */
const MESSAGE_TEXT_TO_ACTION: Record<string, string> = {
  '📅 Запись на приём': 'booking.open',
  'Запись на приём': 'booking.open',
  '⚙️ Меню': 'menu.more',
  'Меню': 'menu.more',
  '📓 Дневник': 'diary.open',
  'Дневник': 'diary.open',
  '/admin_bookings': 'admin.stats.bookings',
  '/admin_users': 'admin.stats.users',
  '/dialogs': 'admin.dialogs.open',
  '/unanswered': 'admin.questions.unanswered',
  '/show_my_id': 'debug.show_my_id',
  '/book': 'booking.open',
  'Неотвеченные вопросы': 'admin.questions.unanswered',
};

function getActionFromText(text: string): string {
  const trimmed = text?.trim() ?? '';
  if (!trimmed) return '';
  if (MESSAGE_TEXT_TO_ACTION[trimmed]) return MESSAGE_TEXT_TO_ACTION[trimmed];
  const firstToken = trimmed.split(/\s+/)[0] ?? '';
  if (firstToken.startsWith('/') && firstToken.includes('@')) {
    const cmd = firstToken.slice(0, firstToken.indexOf('@'));
    const rest = trimmed.slice(firstToken.length);
    return MESSAGE_TEXT_TO_ACTION[cmd + rest] ?? MESSAGE_TEXT_TO_ACTION[cmd] ?? '';
  }
  return '';
}

function parseStartLinkToken(value: string): string | null {
  const trimmed = value.trim();
  const asCommand = trimmed.match(/^\/start\s+(link_[A-Za-z0-9_-]+)$/i);
  if (asCommand?.[1]) return asCommand[1];
  return /^link_[A-Za-z0-9_-]+$/.test(trimmed) ? trimmed : null;
}

function getChatIdFromMessage(msg: MaxUpdateValidated['message']): number | null {
  if (!msg) return null;
  const r = msg.recipient;
  if (r?.chat_id != null && typeof r.chat_id === 'number') return r.chat_id;
  if (r?.user_id != null && typeof r.user_id === 'number') return r.user_id;
  const uid = msg.sender?.user_id;
  if (uid != null && typeof uid === 'number') return uid;
  return null;
}

function getUserIdFromMessage(msg: MaxUpdateValidated['message']): number | null {
  if (msg?.sender?.user_id != null) return msg.sender.user_id;
  return null;
}

function getMessageIdFromMessage(msg: MaxUpdateValidated['message']): string | null {
  return typeof msg?.body?.mid === 'string' && msg.body.mid.trim().length > 0 ? msg.body.mid : null;
}

function getContactPhoneFromMaxMessage(msg: MaxUpdateValidated['message']): string | null {
  const attachments = Array.isArray(msg?.body?.attachments) ? msg.body.attachments : [];
  for (const raw of attachments) {
    const a = raw as { type?: string; payload?: { phone?: string; phone_number?: string } };
    if (a?.type === 'contact') {
      const p = a.payload ?? {};
      const rawPhone =
        typeof p.phone === 'string'
          ? p.phone
          : typeof p.phone_number === 'string'
            ? p.phone_number
            : '';
      return normalizeTelegramContactPhone(rawPhone);
    }
  }
  return null;
}

function getRelayMessageTypeFromMaxMessage(msg: MaxUpdateValidated['message']): SupportRelayMessageType | null {
  const attachments = Array.isArray(msg?.body?.attachments) ? msg.body.attachments : [];
  const first = attachments[0] as { type?: unknown } | undefined;
  const type = typeof first?.type === 'string' ? first.type : null;
  switch (type) {
    case 'image':
      return 'photo';
    case 'file':
      return 'document';
    case 'audio':
      return 'audio';
    case 'video':
      return 'video';
    case 'sticker':
      return 'sticker';
    case 'contact':
      return 'contact';
    case 'location':
      return 'location';
    default:
      return typeof msg?.body?.text === 'string' && msg.body.text.trim().length > 0 ? 'text' : null;
  }
}

/**
 * Maps validated MAX webhook/long-poll Update to internal IncomingUpdate.
 * Real payload: message.body.text, message.sender, message.recipient; callback.*.
 */
export function fromMax(body: MaxUpdateValidated): IncomingUpdate | null {
  if (body.update_type === 'message_callback' && body.callback) {
    const callbackId = body.callback.callback_id;
    const payload = typeof body.callback.payload === 'string' ? body.callback.payload : '';
    const userId = body.callback.user?.user_id;
    const chatId = getChatIdFromMessage(body.message) ?? userId ?? null;
    const messageId = getMessageIdFromMessage(body.message);
    if (!callbackId || chatId === null || userId == null || !messageId) return null;
    const normalized = normalizeDynamicTelegramAction(payload);
    const update: IncomingCallbackUpdate = {
      kind: 'callback',
      chatId,
      messageId,
      channelUserId: userId,
      action: normalized.action,
      callbackData: normalized.action,
      callbackQueryId: callbackId,
      ...(typeof normalized.conversationId === 'string' ? { conversationId: normalized.conversationId } : {}),
      ...(typeof body.callback.user?.username === 'string' ? { channelUsername: body.callback.user.username } : {}),
      ...(typeof body.callback.user?.first_name === 'string' ? { channelFirstName: body.callback.user.first_name } : {}),
      ...(typeof body.callback.user?.last_name === 'string' ? { channelLastName: body.callback.user.last_name } : {}),
      ...(typeof normalized.trackingId === 'string' ? { trackingId: normalized.trackingId } : {}),
      ...(typeof normalized.value === 'number' ? { value: normalized.value } : {}),
      ...(typeof normalized.entryType === 'string' ? { entryType: normalized.entryType } : {}),
      ...(typeof normalized.complexId === 'string' ? { complexId: normalized.complexId } : {}),
      ...(typeof normalized.reminderOccurrenceId === 'string' ? { reminderOccurrenceId: normalized.reminderOccurrenceId } : {}),
      ...(typeof normalized.reminderSnoozeMinutes === 'number' ? { reminderSnoozeMinutes: normalized.reminderSnoozeMinutes } : {}),
      ...(typeof normalized.skipReasonCode === 'string' ? { skipReasonCode: normalized.skipReasonCode } : {}),
      ...(normalized.questionConfirm === 'yes' || normalized.questionConfirm === 'no'
        ? { questionConfirm: normalized.questionConfirm }
        : {}),
    };
    return update;
  }

  if (body.update_type === 'message_created' && body.message) {
    const msg = body.message;
    const text = msg.body?.text ?? '';
    const chatId = getChatIdFromMessage(msg);
    const userId = getUserIdFromMessage(msg);
    if (chatId === null || userId == null) return null;
    const contactPhone = getContactPhoneFromMaxMessage(msg);
    const startLinkToken = parseStartLinkToken(text);
    const action = startLinkToken ? 'start.link' : getActionFromText(text);
    const update: IncomingMessageUpdate = {
      kind: 'message',
      chatId,
      channelId: String(userId),
      ...(getMessageIdFromMessage(msg) ? { messageId: getMessageIdFromMessage(msg) as string } : {}),
      text,
      action,
      ...(startLinkToken ? { linkSecret: startLinkToken } : {}),
      ...(contactPhone ? { phone: contactPhone } : {}),
      ...(getRelayMessageTypeFromMaxMessage(msg) ? { relayMessageType: getRelayMessageTypeFromMaxMessage(msg) as SupportRelayMessageType } : {}),
      ...(typeof msg.sender?.username === 'string' ? { channelUsername: msg.sender.username } : {}),
      ...(typeof msg.sender?.first_name === 'string' ? { channelFirstName: msg.sender.first_name } : {}),
      ...(typeof msg.sender?.last_name === 'string' ? { channelLastName: msg.sender.last_name } : {}),
      userRow: null,
      userState: '',
    };
    return update;
  }

  if (body.update_type === 'bot_started') {
    const msg = body.message;
    const chatId = msg ? getChatIdFromMessage(msg) : (body.chat_id ?? body.user?.user_id ?? null);
    const userId = msg ? getUserIdFromMessage(msg) : (body.user?.user_id ?? null);
    if (chatId === null || userId == null) return null;
    const payloadRaw =
      (typeof body.payload === 'string' && body.payload.trim().length > 0 ? body.payload : null)
      ?? (typeof body.data === 'string' && body.data.trim().length > 0 ? body.data : null)
      ?? (typeof msg?.body?.text === 'string' ? msg.body.text : null);
    const startLinkToken = payloadRaw ? parseStartLinkToken(payloadRaw) : null;
    const update: IncomingMessageUpdate = {
      kind: 'message',
      chatId,
      channelId: String(userId),
      text: startLinkToken ? `/start ${startLinkToken}` : '/start',
      action: startLinkToken ? 'start.link' : '',
      ...(startLinkToken ? { linkSecret: startLinkToken } : {}),
      ...(typeof (msg?.sender?.username ?? body.user?.username) === 'string' ? { channelUsername: (msg?.sender?.username ?? body.user?.username) as string } : {}),
      ...(typeof (msg?.sender?.first_name ?? body.user?.first_name) === 'string' ? { channelFirstName: (msg?.sender?.first_name ?? body.user?.first_name) as string } : {}),
      ...(typeof (msg?.sender?.last_name ?? body.user?.last_name) === 'string' ? { channelLastName: (msg?.sender?.last_name ?? body.user?.last_name) as string } : {}),
      userRow: null,
      userState: '',
    };
    return update;
  }

  if (body.update_type === 'user_added' && body.chat_id != null && body.user?.user_id != null) {
    const update: IncomingMessageUpdate = {
      kind: 'message',
      chatId: body.chat_id,
      channelId: String(body.user.user_id),
      text: '/start',
      action: '',
      ...(typeof body.user.username === 'string' ? { channelUsername: body.user.username } : {}),
      ...(typeof body.user.first_name === 'string' ? { channelFirstName: body.user.first_name } : {}),
      ...(typeof body.user.last_name === 'string' ? { channelLastName: body.user.last_name } : {}),
      userRow: null,
      userState: '',
    };
    return update;
  }

  return null;
}
