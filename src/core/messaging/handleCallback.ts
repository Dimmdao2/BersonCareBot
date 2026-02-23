import type { NotificationsPort } from '../ports/notifications.js';
import type { MessagingPort } from '../ports/messaging.js';
import type { WebhookContent } from '../webhookContent.js';
import { getSettings, updateSettings } from '../notifications/service.js';

/**
 * Handle notification toggle callbacks: update settings, refresh keyboard.
 * Adapter should call answerCallbackQuery in finally.
 */
export async function handleNotificationCallback(
  telegramId: number,
  chatId: number,
  messageId: number,
  data: string,
  notificationsPort: NotificationsPort,
  messagingPort: MessagingPort,
  content: WebhookContent,
): Promise<void> {
  let settings = await getSettings(telegramId, notificationsPort);

  if (data === 'notify_toggle_spb') {
    await updateSettings(telegramId, { notify_spb: !settings.notify_spb }, notificationsPort);
  } else if (data === 'notify_toggle_msk') {
    await updateSettings(telegramId, { notify_msk: !settings.notify_msk }, notificationsPort);
  } else if (data === 'notify_toggle_online') {
    await updateSettings(telegramId, { notify_online: !settings.notify_online }, notificationsPort);
  } else if (data === 'notify_toggle_all') {
    const allTrue = settings.notify_spb && settings.notify_msk && settings.notify_online;
    await updateSettings(
      telegramId,
      { notify_spb: !allTrue, notify_msk: !allTrue, notify_online: !allTrue },
      notificationsPort,
    );
  } else {
    return;
  }

  const fresh = await getSettings(telegramId, notificationsPort);
  const kb = content.buildNotificationKeyboard(fresh);
  await messagingPort.editMessageReplyMarkup({ chat_id: chatId, message_id: messageId, reply_markup: kb });
}

/**
 * Show notifications screen: edit message text + keyboard.
 */
export async function handleShowNotifications(
  chatId: number,
  messageId: number,
  telegramId: number,
  notificationsPort: NotificationsPort,
  messagingPort: MessagingPort,
  content: WebhookContent,
): Promise<void> {
  const settings = await getSettings(telegramId, notificationsPort);
  const kb = content.buildNotificationKeyboard(settings);
  const text = `${content.notificationSettings.title}\n\n${content.notificationSettings.subtitle}`;
  await messagingPort.editMessageText({
    chat_id: chatId,
    message_id: messageId,
    text,
    reply_markup: kb,
  });
}

/**
 * My bookings: edit message to placeholder text.
 */
export async function handleMyBookings(
  chatId: number,
  messageId: number,
  messagingPort: MessagingPort,
  content: WebhookContent,
): Promise<void> {
  await messagingPort.editMessageText({
    chat_id: chatId,
    message_id: messageId,
    text: content.messages.bookingMy,
    reply_markup: content.moreMenuInline,
  });
}

/**
 * Back: clear text to space, set more menu inline.
 */
export async function handleBack(
  chatId: number,
  messageId: number,
  messagingPort: MessagingPort,
  content: WebhookContent,
): Promise<void> {
  try {
    await messagingPort.editMessageText({
      chat_id: chatId,
      message_id: messageId,
      text: ' ',
      reply_markup: content.moreMenuInline,
    });
  } catch {
    await messagingPort.editMessageReplyMarkup({
      chat_id: chatId,
      message_id: messageId,
      reply_markup: content.moreMenuInline,
    });
  }
}
