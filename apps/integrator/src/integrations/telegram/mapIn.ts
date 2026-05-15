/**
 * Преобразование входящих обновлений Telegram в единый формат бота.
 * Текст кнопок и сообщений переводится в действия (запись на приём, меню, кабинет и т.д.),
 * нажатия инлайн-кнопок разбираются в действие и параметры (идентификатор записи, значение и т.д.).
 * Используется при приёме вебхука от Telegram.
 */

import type {
  IncomingCallbackUpdate,
  IncomingMessageUpdate,
  IncomingUpdate,
} from '../../kernel/domain/types.js';
import { telegramConfig } from './config.js';
import type { TelegramWebhookBodyValidated } from './schema.js';

export const MENU_MY_BOOKINGS = 'menu_my_bookings';
export const MENU_BACK = 'menu_back';
export const REQUEST_PHONE_CANCEL_TEXT = 'Вернуться в меню';

const LEGACY_CALLBACK_TO_ACTION: Record<string, string> = {
  menu_my_bookings: 'bookings.show',
  menu_back: 'menu.back',
};

const MESSAGE_TEXT_TO_ACTION: Record<string, string> = {
  '📅 Запись на приём': 'booking.open',
  'Запись на приём': 'booking.open',
  '📓 Дневник': 'diary.open',
  'Дневник': 'diary.open',
  '⚙️ Меню': 'menu.more',
  'Меню': 'menu.more',
  'Помощник': 'menu.more',
  '👤 Кабинет': 'cabinet.open',
  'Кабинет': 'cabinet.open',
  [REQUEST_PHONE_CANCEL_TEXT]: 'phone.request.cancel',
  '/admin_bookings': 'admin.stats.bookings',
  '/admin_users': 'admin.stats.users',
  '/dialogs': 'admin.dialogs.open',
  '/unanswered': 'admin.questions.unanswered',
  '/show_my_id': 'debug.show_my_id',
  'Неотвеченные вопросы': 'admin.questions.unanswered',
};

/** Reply-клавиатура главного меню: только текстовые пункты, совпадающие с {@link MESSAGE_TEXT_TO_ACTION}. WebApp-кнопки сюда не входят. */
const TELEGRAM_REPLY_MENU_ACTIONS = new Set(['booking.open']);

/**
 * Текст с reply-клавиатуры главного меню → action (если это пункт меню, требующий привязки).
 * Должен совпадать с ключами {@link MESSAGE_TEXT_TO_ACTION} для этих кнопок.
 */
export function telegramReplyTextToMenuAction(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const act = MESSAGE_TEXT_TO_ACTION[trimmed];
  if (act && TELEGRAM_REPLY_MENU_ACTIONS.has(act)) return act;
  return null;
}

/** Приводит введённый номер телефона к формату +7... для сохранения и проверки. */
export function normalizeTelegramContactPhone(value: string): string | null {
  const digits = value.replace(/[^\d+]/g, '');
  if (!digits) return null;
  if (digits.startsWith('+') && /^\+\d{10,15}$/.test(digits)) return digits;
  const onlyDigits = digits.replace(/\D/g, '');
  if (onlyDigits.length === 11 && onlyDigits.startsWith('8')) return `+7${onlyDigits.slice(1)}`;
  if (onlyDigits.length === 11 && onlyDigits.startsWith('7')) return `+${onlyDigits}`;
  if (onlyDigits.length === 10) return `+7${onlyDigits}`;
  if (onlyDigits.length >= 10 && onlyDigits.length <= 15) return `+${onlyDigits}`;
  return null;
}

/**
 * Полезная нагрузка inline callback после парса `callback_data` (без транспортных полей чата/сообщения).
 * Совпадает с опциональными полями {@link IncomingCallbackUpdate}, кроме ключей,
 * которые выставляет адаптер (`chatId`, `callbackQueryId`, …): добавление поля в
 * {@link IncomingCallbackUpdate} здесь проявится в типе и напомнит дополнить
 * {@link incomingCallbackPayloadFromNormalized}.
 */
type IncomingCallbackTelegramTransportKeys =
  | 'kind'
  | 'chatId'
  | 'messageId'
  | 'replyToMessageId'
  | 'channelUserId'
  | 'hasLinkedPhone'
  | 'channelUsername'
  | 'channelFirstName'
  | 'channelLastName'
  | 'callbackData'
  | 'callbackQueryId';

export type DynamicChannelCallbackPayload = Omit<
  IncomingCallbackUpdate,
  IncomingCallbackTelegramTransportKeys
> & { action: string };

/** Alias совместимости с внешними упоминаниями «dynamic action». */
export type DynamicActionResult = DynamicChannelCallbackPayload;

type IncomingCallbackPayloadFromNormalize = Omit<DynamicChannelCallbackPayload, 'action'>;

/**
 * Копирует распознанные поля payload в {@link IncomingCallbackUpdate} (кроме `action`).
 */
export function incomingCallbackPayloadFromNormalized(
  normalized: DynamicChannelCallbackPayload,
): IncomingCallbackPayloadFromNormalize {
  const out: IncomingCallbackPayloadFromNormalize = {};
  if (typeof normalized.conversationId === 'string') out.conversationId = normalized.conversationId;
  if (typeof normalized.trackingId === 'string') out.trackingId = normalized.trackingId;
  if (typeof normalized.value === 'number') out.value = normalized.value;
  if (typeof normalized.entryType === 'string') out.entryType = normalized.entryType;
  if (typeof normalized.complexId === 'string') out.complexId = normalized.complexId;
  if (typeof normalized.reminderOccurrenceId === 'string') out.reminderOccurrenceId = normalized.reminderOccurrenceId;
  if (typeof normalized.reminderSnoozeMinutes === 'number') out.reminderSnoozeMinutes = normalized.reminderSnoozeMinutes;
  if (typeof normalized.reminderMuteMinutes === 'number') out.reminderMuteMinutes = normalized.reminderMuteMinutes;
  if (normalized.reminderMutePreset === 'tomorrow') out.reminderMutePreset = 'tomorrow';
  if (typeof normalized.skipReasonCode === 'string') out.skipReasonCode = normalized.skipReasonCode;
  if (normalized.questionConfirm === 'yes' || normalized.questionConfirm === 'no') {
    out.questionConfirm = normalized.questionConfirm;
  }
  return out;
}

/** Разбор callback payload для Telegram и Max (общий формат `callbackData`). */
export function normalizeChannelCallbackPayload(value: string): DynamicChannelCallbackPayload {
  const trimmed = value.trim();
  if (!trimmed) return { action: '' };
  for (const prefix of ['admin_reply:', 'admin_reply_continue:', 'admin_close_dialog:', 'dialogs.view:']) {
    if (trimmed.startsWith(prefix)) {
      const conversationId = trimmed.slice(prefix.length).trim();
      if (!conversationId) return { action: trimmed };
      return {
        action: prefix.slice(0, -1),
        conversationId,
      };
    }
  }
  if (trimmed.startsWith('diary.symptom.select:')) {
    const id = trimmed.slice('diary.symptom.select:'.length).trim();
    return { action: 'diary.symptom.select', ...(id ? { trackingId: id } : {}) };
  }
  if (trimmed.startsWith('diary.symptom.value:')) {
    const rest = trimmed.slice('diary.symptom.value:'.length);
    const [id, valueStr] = rest.split(':', 2);
    const value = valueStr !== undefined ? Math.min(10, Math.max(0, Math.round(Number(valueStr)))) : undefined;
    const out: DynamicActionResult = { action: 'diary.symptom.value' };
    if (id?.trim()) out.trackingId = id.trim();
    if (typeof value === 'number' && Number.isFinite(value)) out.value = value;
    return out;
  }
  if (trimmed.startsWith('diary.symptom.entryType:')) {
    const rest = trimmed.slice('diary.symptom.entryType:'.length);
    const parts = rest.split(':');
    const trackingId = parts[0]?.trim();
    const valueStr = parts[1];
    const entryType = parts[2] === 'daily' ? 'daily' : 'instant';
    const value = valueStr !== undefined ? Math.min(10, Math.max(0, Math.round(Number(valueStr)))) : undefined;
    const out: DynamicActionResult = { action: 'diary.symptom.entryType', entryType };
    if (trackingId) out.trackingId = trackingId;
    if (typeof value === 'number' && Number.isFinite(value)) out.value = value;
    return out;
  }
  if (trimmed.startsWith('diary.lfk.select:')) {
    const id = trimmed.slice('diary.lfk.select:'.length).trim();
    return { action: 'diary.lfk.select', ...(id ? { complexId: id } : {}) };
  }
  if (trimmed.startsWith('diary.lfk.session:')) {
    const id = trimmed.slice('diary.lfk.session:'.length).trim();
    return { action: 'diary.lfk.session', ...(id ? { complexId: id } : {}) };
  }
  if (trimmed.startsWith('rem_snooze:')) {
    const rest = trimmed.slice('rem_snooze:'.length);
    const lastColon = rest.lastIndexOf(':');
    if (lastColon <= 0) return { action: trimmed };
    const occurrenceId = rest.slice(0, lastColon).trim();
    const minutes = Math.round(Number(rest.slice(lastColon + 1)));
    if (
      !occurrenceId
      || !Number.isFinite(minutes)
      || minutes < 1
      || minutes > 720
    ) return { action: trimmed };
    return {
      action: 'rem_snooze',
      reminderOccurrenceId: occurrenceId,
      reminderSnoozeMinutes: minutes,
    };
  }
  if (trimmed.startsWith('rem_done:')) {
    const occurrenceId = trimmed.slice('rem_done:'.length).trim();
    if (!occurrenceId) return { action: trimmed };
    return { action: 'rem_done', reminderOccurrenceId: occurrenceId };
  }
  if (trimmed.startsWith('rem_mute:')) {
    const rest = trimmed.slice('rem_mute:'.length).trim();
    if (rest === 'tomorrow') {
      return { action: 'rem_mute', reminderMutePreset: 'tomorrow' };
    }
    const minutes = Math.round(Number(rest));
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 1440) return { action: trimmed };
    return { action: 'rem_mute', reminderMuteMinutes: minutes };
  }
  if (trimmed.startsWith('rem_skip_r:')) {
    const rest = trimmed.slice('rem_skip_r:'.length);
    const lastColon = rest.lastIndexOf(':');
    if (lastColon <= 0) return { action: trimmed };
    const occurrenceId = rest.slice(0, lastColon).trim();
    const code = rest.slice(lastColon + 1).trim();
    if (!occurrenceId || !code) return { action: trimmed };
    return { action: 'rem_skip_r', reminderOccurrenceId: occurrenceId, skipReasonCode: code };
  }
  if (trimmed.startsWith('rem_skip:')) {
    const occurrenceId = trimmed.slice('rem_skip:'.length).trim();
    if (!occurrenceId) return { action: trimmed };
    return { action: 'rem_skip', reminderOccurrenceId: occurrenceId };
  }
  if (trimmed === 'q_confirm:yes') return { action: 'q_confirm:yes', questionConfirm: 'yes' };
  if (trimmed === 'q_confirm:no') return { action: 'q_confirm:no', questionConfirm: 'no' };
  /** Админ: пометить все неотвеченные из текущей выборки списка (см. question.markAllUnansweredAnswered). */
  if (trimmed === 'questions.mark_all_answered') return { action: 'questions.mark_all_answered' };
  return { action: LEGACY_CALLBACK_TO_ACTION[trimmed] ?? trimmed };
}

/** @deprecated Используйте {@link normalizeChannelCallbackPayload} */
export function normalizeDynamicTelegramAction(value: string): DynamicActionResult {
  return normalizeChannelCallbackPayload(value);
}

export function normalizeTelegramAction(value: string): string {
  return normalizeChannelCallbackPayload(value).action;
}

export function normalizeTelegramMessageAction(value: string): string {
  const trimmed = value.trim();
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

export type FromTelegramContext = {
  userRow: { id: string; channel_id: string } | null;
  telegramId: string | null;
  userState?: string | undefined;
  hasLinkedPhone?: boolean | undefined;
  reqLogger?: {
    info(payload: Record<string, unknown>, message: string): void;
  } | undefined;
};

/**
 * Единый разбор `callback_query` для prod webhook и `fromTelegram`.
 * Должен совпадать с полями {@link IncomingCallbackUpdate}, заполняемыми из {@link normalizeChannelCallbackPayload}.
 */
export function incomingCallbackUpdateFromTelegramCallbackQuery(
  cq: NonNullable<TelegramWebhookBodyValidated['callback_query']>,
  extras?: { hasLinkedPhone?: boolean },
): IncomingCallbackUpdate | null {
  const chatId = cq.message?.chat?.id;
  const messageId = cq.message?.message_id;
  const telegramId = cq.from?.id;
  if (typeof chatId !== 'number' || typeof messageId !== 'number' || typeof telegramId !== 'number') {
    return null;
  }
  const normalized = normalizeChannelCallbackPayload(cq.data ?? '');
  return {
    kind: 'callback',
    chatId,
    messageId,
    channelUserId: telegramId,
    action: normalized.action,
    ...(typeof extras?.hasLinkedPhone === 'boolean' ? { hasLinkedPhone: extras.hasLinkedPhone } : {}),
    ...(typeof cq.from.username === 'string' ? { channelUsername: cq.from.username } : {}),
    ...(typeof cq.from.first_name === 'string' ? { channelFirstName: cq.from.first_name } : {}),
    ...(typeof cq.from.last_name === 'string' ? { channelLastName: cq.from.last_name } : {}),
    ...incomingCallbackPayloadFromNormalized(normalized),
    callbackData: normalized.action,
    callbackQueryId: cq.id,
  };
}

/**
 * Map validated webhook body + context to internal IncomingUpdate.
 */
export function fromTelegram(
  body: TelegramWebhookBodyValidated,
  context: FromTelegramContext,
): IncomingUpdate | null {
  const { userRow, telegramId, userState, hasLinkedPhone } = context;

  if (body.callback_query) {
    return incomingCallbackUpdateFromTelegramCallbackQuery(body.callback_query, {
      ...(typeof hasLinkedPhone === 'boolean' ? { hasLinkedPhone } : {}),
    });
  }

  if (body.message?.from && body.message.chat && typeof body.message.chat.id === 'number') {
    const msg = body.message;
    const chatId = msg.chat?.id;
    if (!telegramId || typeof chatId !== 'number') return null;
    const fromId = msg.from?.id;
    const contact = msg.contact;
    const contactOwnedBySender =
      typeof contact?.phone_number === 'string' && contact.user_id === fromId;
    const normalizedPhone =
      contact && typeof contact.phone_number === 'string'
        ? normalizeTelegramContactPhone(contact.phone_number)
        : null;
    const reqLogger = context.reqLogger;
    const adminTelegramId = telegramConfig.adminTelegramId;
    if (reqLogger) {
      reqLogger.info({ adminTelegramId }, '[telegram][mapIn] admin chat diagnostics');
      reqLogger.info({ chatId: adminTelegramId, text: msg.text ?? '' }, '[telegram][mapIn] adminForward will be set');
    }
    const replyToRaw = (msg as { reply_to_message?: { message_id?: number } }).reply_to_message;
    const replyToMessageId =
      replyToRaw && typeof replyToRaw.message_id === 'number' ? replyToRaw.message_id : undefined;
    const update: IncomingMessageUpdate = {
      kind: 'message',
      chatId,
      channelId: telegramId,
      ...(typeof msg.message_id === 'number' ? { messageId: msg.message_id } : {}),
      ...(replyToMessageId !== undefined ? { replyToMessageId } : {}),
      text: msg.text ?? '',
      action: normalizeTelegramMessageAction(msg.text ?? ''),
      ...(normalizedPhone ? { phone: normalizedPhone } : {}),
      ...(contactOwnedBySender && typeof msg.contact?.phone_number === 'string' && { contactPhone: msg.contact.phone_number }),
      ...(typeof hasLinkedPhone === 'boolean' && { hasLinkedPhone }),
      ...(typeof msg.from?.username === 'string' && { channelUsername: msg.from.username }),
      ...(typeof msg.from?.first_name === 'string' && { channelFirstName: msg.from.first_name } ),
      ...(typeof msg.from?.last_name === 'string' && { channelLastName: msg.from.last_name } ),
      userRow,
      userState: typeof userState === 'string' ? userState : '',
      adminForward: { chatId: adminTelegramId, text: msg.text ?? '' },
    };
    return update;
  }

  return null;
}
