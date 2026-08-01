import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
  IncomingCallbackUpdate,
  IncomingMessageUpdate,
  IncomingUpdate,
} from '../../kernel/domain/types.js';
import type { MaxUpdateValidated } from './schema.js';
import type { SupportRelayMessageType } from '../../kernel/domain/supportRelay/messageTypes.js';
import { logger } from '../../infra/observability/logger.js';
import {
  canonicalizeMessengerStartText,
  parseMessengerStartCommand,
} from '../common/messengerStartParse.js';
import {
  normalizeChannelCallbackPayload,
  normalizeTelegramContactPhone,
} from '../telegram/mapIn.js';

/** Map MAX button payload / text to internal action (e.g. for menu). */
const MESSAGE_TEXT_TO_ACTION: Record<string, string> = {
  '📅 Запись на приём': 'booking.open',
  'Запись на приём': 'booking.open',
  '⚙️ Меню': 'menu.more',
  Меню: 'menu.more',
  Помощник: 'menu.more',
  '/admin_bookings': 'admin.stats.bookings',
  '/admin_users': 'admin.stats.users',
  '/dialogs': 'admin.dialogs.open',
  '/unanswered': 'admin.questions.unanswered',
  '/show_my_id': 'debug.show_my_id',
  '/book': 'booking.open',
  '/menu': 'nav.webapp.menu',
  Отмена: 'phone.request.cancel',
  'Вернуться в меню': 'phone.request.cancel',
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

function getReplyToMessageIdFromMaxMessage(msg: MaxUpdateValidated['message']): string | null {
  const link = msg?.link as { type?: string; message?: { mid?: unknown } } | null | undefined;
  if (!link || link.type !== 'reply') return null;
  const mid = link.message?.mid;
  return typeof mid === 'string' && mid.trim().length > 0 ? mid.trim() : null;
}

function getCallbackMessageId(body: MaxUpdateValidated): string | null {
  const fromMessage = getMessageIdFromMessage(body.message);
  if (fromMessage) return fromMessage;
  const root = typeof body.message_id === 'string' ? body.message_id.trim() : '';
  return root.length > 0 ? root : null;
}

/** Literal two-char escape sequences "\r\n"/"\n" → real newlines (some transports double-escape vcf_info). */
function unescapeVcfLiterals(vcf: string): string {
  return vcf.replace(/\\r\\n/g, '\r\n').replace(/\\n/g, '\n');
}

/** Extract first TEL value from a vCard string (handles TYPE=...: variants, CRLF/LF, literal-escaped newlines). */
function extractPhoneFromVcf(vcf: string): string {
  // Tolerate transports delivering literal "\r\n"/"\n" sequences instead of real newlines
  const text = !/[\r\n]/.test(vcf) && /\\r\\n|\\n/.test(vcf) ? unescapeVcfLiterals(vcf) : vcf;
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  for (const line of lines) {
    // Match: TEL[;TYPE=...]:+79001234567 or TEL:+79001234567
    const m = /^TEL(?:;[^:]*)?:(.+)$/i.exec(line.trim());
    if (m?.[1]) return m[1].trim();
  }
  return '';
}

/** Constant-time hex-digest comparison (timingSafeEqual throws on unequal lengths — guard first). */
function safeHashEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Verify the MAX contact attachment hash.
 * Formula (dev.max.ru docs): HMAC-SHA256(key=botApiToken, data=vcf_info), hex-encoded.
 * Docs are ambiguous about vcf_info canonicalization, so the HMAC is computed over both the raw
 * string and (when it contains literal "\r\n"/"\n" sequences) the unescaped form — either match
 * accepts. Security unchanged: both HMACs are keyed by the bot token an attacker cannot know.
 * Single chokepoint for all skip-verification cases: distinguishes hash-missing from token-missing.
 */
function verifyContactHash(
  vcfInfo: string,
  hash: string | undefined,
  botToken: string,
): { status: 'valid' | 'mismatch' | 'hash_missing' | 'token_missing'; expectedPrefixes: string[] } {
  if (!hash) return { status: 'hash_missing', expectedPrefixes: [] };
  if (!botToken) return { status: 'token_missing', expectedPrefixes: [] };
  const candidates = [vcfInfo];
  const unescaped = unescapeVcfLiterals(vcfInfo);
  if (unescaped !== vcfInfo) candidates.push(unescaped);
  const expected = candidates.map((c) => createHmac('sha256', botToken).update(c).digest('hex'));
  if (expected.some((e) => safeHashEquals(e, hash)))
    return { status: 'valid', expectedPrefixes: [] };
  return { status: 'mismatch', expectedPrefixes: expected.map((e) => e.slice(0, 8)) };
}

/**
 * Parse contact attachment and return normalized phone or null.
 * Logs WARN on hash mismatch (spoofed contact → reject); accepts with WARN when the hash is
 * absent in the payload or when botToken is not configured (telemetry only in both cases).
 */
function getContactPhoneFromMaxMessage(
  msg: MaxUpdateValidated['message'],
  botToken: string,
): string | null {
  const attachments = Array.isArray(msg?.body?.attachments) ? msg.body.attachments : [];
  for (const raw of attachments) {
    const a = raw as {
      type?: string;
      payload?: { vcf_info?: string; hash?: string; phone?: string };
    };
    if (a?.type !== 'contact') continue;

    const p = a.payload ?? {};

    // Real MAX payload: vcf_info + hash
    if (typeof p.vcf_info === 'string' && p.vcf_info.trim().length > 0) {
      const vcf = p.vcf_info;
      const check = verifyContactHash(vcf, p.hash, botToken);

      if (check.status === 'mismatch') {
        logger.warn(
          {
            vcfPresent: true,
            receivedHashPrefix: typeof p.hash === 'string' ? p.hash.slice(0, 8) : 'n/a',
            expectedHashPrefixes: check.expectedPrefixes,
          },
          'max contact hash mismatch — rejecting contact phone',
        );
        return null;
      }

      if (check.status === 'hash_missing') {
        logger.warn(
          { vcfPresent: true, hashPresent: false },
          'max contact hash absent — accepting phone (telemetry only)',
        );
      } else if (check.status === 'token_missing') {
        logger.warn(
          { vcfPresent: true, hashPresent: true },
          'max contact token not configured — hash not verified, accepting phone',
        );
      }

      const phone = extractPhoneFromVcf(vcf);
      if (phone) return normalizeTelegramContactPhone(phone);
    }

    // Fallback: no vcf_info — return null (no parseable phone)
    return null;
  }
  return null;
}

function getRelayMessageTypeFromMaxMessage(
  msg: MaxUpdateValidated['message'],
): SupportRelayMessageType | null {
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
 * @param botToken  Bot API key for HMAC-SHA256 contact-hash verification. Defaults to MAX_API_KEY env.
 */
export function fromMax(body: MaxUpdateValidated, botToken?: string): IncomingUpdate | null {
  const resolvedToken = botToken ?? '';
  if (body.update_type === 'message_callback' && body.callback) {
    const callbackId = body.callback.callback_id;
    const payload = typeof body.callback.payload === 'string' ? body.callback.payload : '';
    const userId = body.callback.user?.user_id;
    const chatId = getChatIdFromMessage(body.message) ?? userId ?? null;
    const messageId = getCallbackMessageId(body);
    if (!callbackId || chatId === null || userId == null || !messageId) return null;
    const normalized = normalizeChannelCallbackPayload(payload);
    const replyToMid = body.message ? getReplyToMessageIdFromMaxMessage(body.message) : null;
    const update: IncomingCallbackUpdate = {
      kind: 'callback',
      chatId,
      messageId,
      channelUserId: userId,
      ...(replyToMid ? { replyToMessageId: replyToMid } : {}),
      action: normalized.action,
      callbackData: normalized.action,
      callbackQueryId: callbackId,
      ...(typeof normalized.conversationId === 'string'
        ? { conversationId: normalized.conversationId }
        : {}),
      ...(typeof body.callback.user?.username === 'string'
        ? { channelUsername: body.callback.user.username }
        : {}),
      ...(typeof body.callback.user?.first_name === 'string'
        ? { channelFirstName: body.callback.user.first_name }
        : {}),
      ...(typeof body.callback.user?.last_name === 'string'
        ? { channelLastName: body.callback.user.last_name }
        : {}),
      ...(typeof normalized.reminderOccurrenceId === 'string'
        ? { reminderOccurrenceId: normalized.reminderOccurrenceId }
        : {}),
      ...(typeof normalized.reminderSnoozeMinutes === 'number'
        ? { reminderSnoozeMinutes: normalized.reminderSnoozeMinutes }
        : {}),
      ...(typeof normalized.reminderMuteMinutes === 'number'
        ? { reminderMuteMinutes: normalized.reminderMuteMinutes }
        : {}),
      ...(normalized.reminderMutePreset === 'tomorrow' ? { reminderMutePreset: 'tomorrow' } : {}),
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
    const contactPhone = getContactPhoneFromMaxMessage(msg, resolvedToken);
    const canonical = canonicalizeMessengerStartText(text);
    const trimmedStart = canonical.replace(/^\uFEFF+/, '').trim();
    let action: string;
    let linkSecret: string | undefined;
    let authSecret: string | undefined;
    let phoneFromStart: string | undefined;
    if (trimmedStart.startsWith('/start')) {
      const dictAction = getActionFromText(text);
      const p = parseMessengerStartCommand(trimmedStart, dictAction);
      action = p.action;
      if (p.linkSecret !== undefined) linkSecret = p.linkSecret;
      if (p.authSecret !== undefined) authSecret = p.authSecret;
      if (p.phone !== undefined) phoneFromStart = p.phone;
    } else {
      action = getActionFromText(text);
    }
    const phoneOut = phoneFromStart ?? contactPhone ?? undefined;
    const replyToMid = getReplyToMessageIdFromMaxMessage(msg);
    const update: IncomingMessageUpdate = {
      kind: 'message',
      chatId,
      channelId: String(userId),
      ...(getMessageIdFromMessage(msg)
        ? { messageId: getMessageIdFromMessage(msg) as string }
        : {}),
      text,
      action,
      ...(linkSecret !== undefined ? { linkSecret } : {}),
      ...(authSecret !== undefined ? { authSecret } : {}),
      ...(phoneOut ? { phone: phoneOut } : {}),
      ...(replyToMid ? { replyToMessageId: replyToMid } : {}),
      ...(getRelayMessageTypeFromMaxMessage(msg)
        ? { relayMessageType: getRelayMessageTypeFromMaxMessage(msg) as SupportRelayMessageType }
        : {}),
      ...(typeof msg.sender?.username === 'string' ? { channelUsername: msg.sender.username } : {}),
      ...(typeof msg.sender?.first_name === 'string'
        ? { channelFirstName: msg.sender.first_name }
        : {}),
      ...(typeof msg.sender?.last_name === 'string'
        ? { channelLastName: msg.sender.last_name }
        : {}),
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
      (typeof body.payload === 'string' && body.payload.trim().length > 0 ? body.payload : null) ??
      (typeof body.data === 'string' && body.data.trim().length > 0 ? body.data : null) ??
      (typeof msg?.body?.text === 'string' ? msg.body.text : null);
    const rawTrim = typeof payloadRaw === 'string' ? payloadRaw.trim() : '';
    const canonical = rawTrim ? canonicalizeMessengerStartText(rawTrim) : '/start';
    const effectiveStart = canonical.startsWith('/start')
      ? canonical.trim()
      : rawTrim
        ? `/start ${rawTrim}`
        : '/start';
    const p = parseMessengerStartCommand(effectiveStart.trim(), '');
    const update: IncomingMessageUpdate = {
      kind: 'message',
      chatId,
      channelId: String(userId),
      text: effectiveStart.trim(),
      action: p.action,
      ...(p.linkSecret !== undefined ? { linkSecret: p.linkSecret } : {}),
      ...(p.authSecret !== undefined ? { authSecret: p.authSecret } : {}),
      ...(p.phone !== undefined ? { phone: p.phone } : {}),
      ...(typeof (msg?.sender?.username ?? body.user?.username) === 'string'
        ? { channelUsername: (msg?.sender?.username ?? body.user?.username) as string }
        : {}),
      ...(typeof (msg?.sender?.first_name ?? body.user?.first_name) === 'string'
        ? { channelFirstName: (msg?.sender?.first_name ?? body.user?.first_name) as string }
        : {}),
      ...(typeof (msg?.sender?.last_name ?? body.user?.last_name) === 'string'
        ? { channelLastName: (msg?.sender?.last_name ?? body.user?.last_name) as string }
        : {}),
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
      ...(typeof body.user.first_name === 'string'
        ? { channelFirstName: body.user.first_name }
        : {}),
      ...(typeof body.user.last_name === 'string' ? { channelLastName: body.user.last_name } : {}),
      userRow: null,
      userState: '',
    };
    return update;
  }

  return null;
}
