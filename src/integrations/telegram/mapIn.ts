import type {
  IncomingUpdate,
  IncomingMessageUpdate,
  IncomingCallbackUpdate,
} from '../../kernel/domain/types.js';
import type { TelegramWebhookBodyValidated } from './schema.js';

export const NOTIFY_KEYS = ['notify_toggle_spb', 'notify_toggle_msk', 'notify_toggle_online', 'notify_toggle_all'] as const;
export const MENU_NOTIFICATIONS = 'menu_notifications';
export const MENU_MY_BOOKINGS = 'menu_my_bookings';
export const MENU_BACK = 'menu_back';

const LEGACY_CALLBACK_TO_ACTION: Record<string, string> = {
  menu_notifications: 'notifications.show',
  menu_my_bookings: 'bookings.show',
  menu_back: 'menu.back',
  notify_toggle_spb: 'notifications.toggle.spb',
  notify_toggle_msk: 'notifications.toggle.msk',
  notify_toggle_online: 'notifications.toggle.online',
  notify_toggle_all: 'notifications.toggle.all',
};

const MESSAGE_TEXT_TO_ACTION: Record<string, string> = {
  '📅 Запись на приём': 'booking.open',
  'Запись на приём': 'booking.open',
  '❓ Задать вопрос': 'question.ask',
  'Задать вопрос': 'question.ask',
  '⚙️ Меню': 'menu.more',
  'Меню': 'menu.more',
  '/admin_bookings': 'admin.stats.bookings',
  '/admin_users': 'admin.stats.users',
  '/dialogs': 'admin.dialogs.open',
};

function normalizeDynamicTelegramAction(value: string): { action: string; conversationId?: string } {
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
  return { action: LEGACY_CALLBACK_TO_ACTION[trimmed] ?? trimmed };
}

export function normalizeTelegramAction(value: string): string {
  return normalizeDynamicTelegramAction(value).action;
}

export function normalizeTelegramMessageAction(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return MESSAGE_TEXT_TO_ACTION[trimmed] ?? '';
}

/** Проверяет, относится ли callback к настройкам уведомлений. */
export function isNotifyCallback(data: string): boolean {
  return data.startsWith('notify_');
}

export type FromTelegramContext = {
  userRow: { id: string; channel_id: string } | null;
  telegramId: string | null;
  userState?: string | undefined;
  hasLinkedPhone?: boolean | undefined;
};

/**
 * Map validated webhook body + context to internal IncomingUpdate.
 */
export function fromTelegram(
  body: TelegramWebhookBodyValidated,
  context: FromTelegramContext,
): IncomingUpdate | null {
  const { userRow, telegramId, userState, hasLinkedPhone } = context;

  if (body.callback_query) {
    const cq = body.callback_query;
    const chatId = cq.message?.chat?.id;
    const messageId = cq.message?.message_id;
    if (typeof chatId !== 'number' || typeof messageId !== 'number') return null;
    const normalized = normalizeDynamicTelegramAction(cq.data ?? '');
    const update: IncomingCallbackUpdate = {
      kind: 'callback',
      chatId,
      messageId,
      channelUserId: cq.from.id,
      action: normalized.action,
      ...(typeof hasLinkedPhone === 'boolean' && { hasLinkedPhone }),
      ...(typeof cq.from.username === 'string' ? { channelUsername: cq.from.username } : {}),
      ...(typeof cq.from.first_name === 'string' ? { channelFirstName: cq.from.first_name } : {}),
      ...(typeof cq.from.last_name === 'string' ? { channelLastName: cq.from.last_name } : {}),
      ...(typeof normalized.conversationId === 'string' ? { conversationId: normalized.conversationId } : {}),
      callbackData: normalized.action,
      callbackQueryId: cq.id,
    };
    return update;
  }

  if (body.message?.from && body.message.chat && typeof body.message.chat.id === 'number') {
    const msg = body.message;
    const chatId = msg.chat?.id;
    if (!telegramId || typeof chatId !== 'number') return null;
    const reqLogger = (context as any)?.reqLogger;
    const adminTelegramIdRaw = process.env.ADMIN_TELEGRAM_ID;
    const adminTelegramId = typeof adminTelegramIdRaw === 'string' ? Number(adminTelegramIdRaw) : undefined;
    if (reqLogger) {
      reqLogger.info({ adminTelegramIdRaw, adminTelegramId }, '[telegram][mapIn] ADMIN_TELEGRAM_ID diagnostics');
      if (typeof adminTelegramId === 'number' && Number.isFinite(adminTelegramId)) {
        reqLogger.info({ chatId: adminTelegramId, text: msg.text ?? '' }, '[telegram][mapIn] adminForward will be set');
      } else {
        reqLogger.warn({ adminTelegramId }, '[telegram][mapIn] adminForward NOT set, invalid adminTelegramId');
      }
    }
    const update: IncomingMessageUpdate = {
      kind: 'message',
      chatId,
      channelId: telegramId,
      ...(typeof msg.message_id === 'number' ? { messageId: msg.message_id } : {}),
      text: msg.text ?? '',
      action: normalizeTelegramMessageAction(msg.text ?? ''),
      ...(typeof msg.contact?.phone_number === 'string' && { contactPhone: msg.contact.phone_number }),
      ...(typeof hasLinkedPhone === 'boolean' && { hasLinkedPhone }),
      ...(typeof msg.from?.username === 'string' && { channelUsername: msg.from.username }),
      ...(typeof msg.from?.first_name === 'string' && { channelFirstName: msg.from.first_name } ),
      ...(typeof msg.from?.last_name === 'string' && { channelLastName: msg.from.last_name } ),
      userRow,
      userState: typeof userState === 'string' ? userState : '',
      ...(typeof adminTelegramId === 'number' && Number.isFinite(adminTelegramId)
        ? { adminForward: { chatId: adminTelegramId, text: msg.text ?? '' } }
        : {}),
    };
    return update;
  }

  return null;
}
