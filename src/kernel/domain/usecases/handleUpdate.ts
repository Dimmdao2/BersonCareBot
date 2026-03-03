import type { UserPort } from '../ports/user.js';
import type { NotificationsPort } from '../ports/notifications.js';
import type { WebhookContent } from '../webhookContent.js';
import type { IncomingUpdate, OutgoingAction } from '../types.js';
import { handleStart, handleAsk, handleQuestion, handleBook, handleMore, handleDefaultIdle } from './handleMessage.js';
import {
  handleNotificationCallback,
  handleShowNotifications,
  handleMyBookings,
  handleBack,
} from './handleCallback.js';

function normalizePhone(value: string): string | null {
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

function mainMenuMarkup(content: WebhookContent) {
  return {
    keyboard: content.mainMenuKeyboard,
    resize_keyboard: true,
    one_time_keyboard: false,
  };
}

async function requestPhoneLink(
  chatId: number,
  telegramId: string,
  userPort: UserPort,
  content: WebhookContent,
): Promise<OutgoingAction[]> {
  await userPort.setTelegramUserState(telegramId, 'await_contact:subscription');
  return [
    {
      type: 'sendMessage',
      chatId,
      text: content.messages.confirmPhoneForRubitime,
      replyMarkup: content.requestContactKeyboard,
    },
  ];
}

/**
 * Single entry: map incoming update to list of outgoing actions.
 * Domain does not know about Telegram; only internal types.
 */
export async function handleUpdate(
  incoming: IncomingUpdate,
  userPort: UserPort,
  notificationsPort: NotificationsPort,
  content: WebhookContent,
): Promise<OutgoingAction[]> {
  if (incoming.kind === 'callback') {
    const data = incoming.callbackData;
    const actions: OutgoingAction[] = [];

    if (data.startsWith('notify_')) {
      const result = await handleNotificationCallback(
        incoming.telegramId,
        incoming.chatId,
        incoming.messageId,
        data,
        notificationsPort,
        content,
      );
      if (result) actions.push(...result);
    } else if (data === 'menu_notifications') {
      const result = await handleShowNotifications(
        incoming.chatId,
        incoming.messageId,
        incoming.telegramId,
        notificationsPort,
        content,
      );
      actions.push(...result);
    } else if (data === 'menu_my_bookings') {
      if (!incoming.hasLinkedPhone) {
        const result = await requestPhoneLink(
          incoming.chatId,
          String(incoming.telegramId),
          userPort,
          content,
        );
        actions.push(...result);
      } else {
      const result = await handleMyBookings(incoming.chatId, incoming.messageId, content);
      actions.push(...result);
      }
    } else if (data === 'menu_back') {
      const result = await handleBack(incoming.chatId, incoming.messageId, content);
      actions.push(...result);
    }

    actions.push({ type: 'answerCallbackQuery', callbackQueryId: incoming.callbackQueryId });
    return actions;
  }

  // incoming.kind === 'message'
  const { chatId, telegramId, text, userRow, userState, adminForward } = incoming;
  if (!userRow || !telegramId) return [];

  if (userState.startsWith('await_contact:')) {
    const normalized = incoming.contactPhone ? normalizePhone(incoming.contactPhone) : null;
    if (!normalized) {
      return [
        {
          type: 'sendMessage',
          chatId,
          text: content.messages.confirmPhoneForRubitime,
          replyMarkup: content.requestContactKeyboard,
        },
      ];
    }
    await userPort.setTelegramUserPhone(telegramId, normalized);
    await userPort.setTelegramUserState(telegramId, 'idle');
    return [
      {
        type: 'sendMessage',
        chatId,
        text: content.messages.chooseMenu,
        replyMarkup: mainMenuMarkup(content),
      },
    ];
  }

  if (text === '/start' || text.startsWith('/start ')) {
    const { consumed, actions } = await handleStart(
      chatId,
      Number(telegramId),
      text,
      incoming.hasLinkedPhone ?? false,
      userPort,
      content,
    );
    return consumed ? actions : [];
  }

  if (text === content.mainMenu.ask) {
    return handleAsk(chatId, telegramId, userPort, content);
  }

  if (userState === 'waiting_for_question' && text) {
    // Menu actions have priority over "question" mode:
    // pressing a menu button cancels waiting state and routes to that action.
    if (text === content.mainMenu.book) {
      if (!(incoming.hasLinkedPhone ?? false)) {
        return requestPhoneLink(chatId, telegramId, userPort, content);
      }
      return handleBook(chatId, telegramId, userPort, content);
    }
    if (text === content.mainMenu.more) {
      await userPort.setTelegramUserState(telegramId, 'idle');
      return handleMore(chatId, content);
    }
    if (text === content.mainMenu.ask) {
      return handleAsk(chatId, telegramId, userPort, content);
    }
    return handleQuestion(chatId, telegramId, text, userPort, content, adminForward);
  }

  if (text === content.mainMenu.book) {
    if (!(incoming.hasLinkedPhone ?? false)) {
      return requestPhoneLink(chatId, telegramId, userPort, content);
    }
    return handleBook(chatId, telegramId, userPort, content);
  }

  if (text === content.mainMenu.more) {
    return handleMore(chatId, content);
  }

  if (userState === 'idle') {
    return handleDefaultIdle(chatId, content);
  }

  return [];
}
