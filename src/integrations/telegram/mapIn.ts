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
};

export function normalizeTelegramAction(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return LEGACY_CALLBACK_TO_ACTION[trimmed] ?? trimmed;
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
  adminForward?: { chatId: number; text: string } | undefined;
};

/**
 * Map validated webhook body + context to internal IncomingUpdate.
 */
export function fromTelegram(
  body: TelegramWebhookBodyValidated,
  context: FromTelegramContext,
): IncomingUpdate | null {
  const { userRow, telegramId, userState, hasLinkedPhone, adminForward } = context;

  if (body.callback_query) {
    const cq = body.callback_query;
    const chatId = cq.message?.chat?.id;
    const messageId = cq.message?.message_id;
    if (typeof chatId !== 'number' || typeof messageId !== 'number') return null;
    const update: IncomingCallbackUpdate = {
      kind: 'callback',
      chatId,
      messageId,
      channelUserId: cq.from.id,
      action: normalizeTelegramAction(cq.data ?? ''),
      ...(typeof hasLinkedPhone === 'boolean' && { hasLinkedPhone }),
      callbackData: normalizeTelegramAction(cq.data ?? ''),
      callbackQueryId: cq.id,
    };
    return update;
  }

  if (body.message?.from && body.message.chat && typeof body.message.chat.id === 'number') {
    const msg = body.message;
    const chatId = msg.chat!.id;
    if (!telegramId) return null;
    const update: IncomingMessageUpdate = {
      kind: 'message',
      chatId,
      channelId: telegramId,
      text: msg.text ?? '',
      action: normalizeTelegramMessageAction(msg.text ?? ''),
      ...(typeof msg.contact?.phone_number === 'string' && { contactPhone: msg.contact.phone_number }),
      ...(typeof hasLinkedPhone === 'boolean' && { hasLinkedPhone }),
      ...(typeof msg.from?.username === 'string' && { channelUsername: msg.from.username }),
      userRow,
      userState: typeof userState === 'string' ? userState : '',
      ...(adminForward !== undefined && { adminForward }),
    };
    return update;
  }

  return null;
}
