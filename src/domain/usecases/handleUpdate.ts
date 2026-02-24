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
      const result = await handleMyBookings(incoming.chatId, incoming.messageId, content);
      actions.push(...result);
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

  if (text === '/start' || text.startsWith('/start ')) {
    const { consumed, actions } = await handleStart(chatId, Number(telegramId), text, userPort, content);
    return consumed ? actions : [];
  }

  if (text === content.mainMenu.ask) {
    return handleAsk(chatId, telegramId, userPort, content);
  }

  if (userState === 'waiting_for_question' && text) {
    return handleQuestion(chatId, telegramId, text, userPort, content, adminForward);
  }

  if (text === content.mainMenu.book) {
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
