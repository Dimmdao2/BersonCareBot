import type { NotificationsPort, NotificationSettingsPatch } from '../ports/notifications.js';

export async function getSettings(channelUserId: number, notificationsPort: NotificationsPort) {
  return (await notificationsPort.getNotificationSettings(channelUserId)) ?? {
    notify_spb: false,
    notify_msk: false,
    notify_online: false,
    notify_bookings: false,
  };
}

export async function updateSettings(
  channelUserId: number,
  patch: NotificationSettingsPatch,
  notificationsPort: NotificationsPort,
): Promise<void> {
  await notificationsPort.updateNotificationSettings(channelUserId, patch);
}
