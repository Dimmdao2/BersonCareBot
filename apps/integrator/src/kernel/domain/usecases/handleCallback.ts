import type { NotificationsPort } from '../ports/notifications.js';
import type { WebhookContent } from '../webhookContent.js';
import type { OutgoingAction } from '../types.js';
import { getSettings, updateSettings } from './notifications.js';

export async function handleNotificationCallback(
  channelUserId: number,
  chatId: number,
  messageId: number,
  data: string,
  notificationsPort: NotificationsPort,
  content: WebhookContent,
): Promise<OutgoingAction[] | null> {
  // ARCH-V3 MOVE
  // этот код должен быть перенесён в orchestrator (сценарные ветки callback)
  const settings = await getSettings(channelUserId, notificationsPort);

  if (data === 'notify_toggle_spb') {
    await updateSettings(channelUserId, { notify_spb: !settings.notify_spb }, notificationsPort);
  } else if (data === 'notify_toggle_msk') {
    await updateSettings(channelUserId, { notify_msk: !settings.notify_msk }, notificationsPort);
  } else if (data === 'notify_toggle_online') {
    await updateSettings(channelUserId, { notify_online: !settings.notify_online }, notificationsPort);
  } else if (data === 'notify_toggle_bookings') {
    await updateSettings(channelUserId, { notify_bookings: !settings.notify_bookings }, notificationsPort);
  } else if (data === 'notify_toggle_all') {
    const allTrue = settings.notify_spb && settings.notify_msk && settings.notify_online && settings.notify_bookings;
    await updateSettings(
      channelUserId,
      { notify_spb: !allTrue, notify_msk: !allTrue, notify_online: !allTrue, notify_bookings: !allTrue },
      notificationsPort,
    );
  } else {
    return null;
  }

  const fresh = await getSettings(channelUserId, notificationsPort);
  const kb = content.buildNotificationKeyboard(fresh);
  return [{ type: 'editMessageReplyMarkup', chatId, messageId, replyMarkup: kb }];
}

export async function handleShowNotifications(
  chatId: number,
  messageId: number,
  channelUserId: number,
  notificationsPort: NotificationsPort,
  content: WebhookContent,
): Promise<OutgoingAction[]> {
  const settings = await getSettings(channelUserId, notificationsPort);
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
