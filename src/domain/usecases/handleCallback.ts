import type { NotificationsPort } from '../ports/notifications.js';
import type { WebhookContent } from '../webhookContent.js';
import type { OutgoingAction } from '../types.js';
import { getSettings, updateSettings } from './notifications.js';

export async function handleNotificationCallback(
  telegramId: number,
  chatId: number,
  messageId: number,
  data: string,
  notificationsPort: NotificationsPort,
  content: WebhookContent,
): Promise<OutgoingAction[] | null> {
  const settings = await getSettings(telegramId, notificationsPort);

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
    return null;
  }

  const fresh = await getSettings(telegramId, notificationsPort);
  const kb = content.buildNotificationKeyboard(fresh);
  return [{ type: 'editMessageReplyMarkup', chatId, messageId, replyMarkup: kb }];
}

export async function handleShowNotifications(
  chatId: number,
  messageId: number,
  telegramId: number,
  notificationsPort: NotificationsPort,
  content: WebhookContent,
): Promise<OutgoingAction[]> {
  const settings = await getSettings(telegramId, notificationsPort);
  const kb = content.buildNotificationKeyboard(settings);
  const text = `${content.notificationSettings.title}\n\n${content.notificationSettings.subtitle}`;
  return [{ type: 'editMessageText', chatId, messageId, text, replyMarkup: kb }];
}

export async function handleMyBookings(
  chatId: number,
  messageId: number,
  content: WebhookContent,
): Promise<OutgoingAction[]> {
  return [
    { type: 'editMessageText', chatId, messageId, text: content.messages.bookingMy, replyMarkup: content.moreMenuInline },
  ];
}

export async function handleBack(
  chatId: number,
  messageId: number,
  content: WebhookContent,
): Promise<OutgoingAction[]> {
  return [
    { type: 'editMessageText', chatId, messageId, text: ' ', replyMarkup: content.moreMenuInline },
    { type: 'editMessageReplyMarkup', chatId, messageId, replyMarkup: content.moreMenuInline },
  ];
}
