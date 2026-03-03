import type { NotificationsPort, NotificationSettingsPatch } from '../ports/notifications.js';

export async function getSettings(telegramId: number, notificationsPort: NotificationsPort) {
  return (await notificationsPort.getNotificationSettings(telegramId)) ?? {
    notify_spb: false,
    notify_msk: false,
    notify_online: false,
  };
}

export async function updateSettings(
  telegramId: number,
  patch: NotificationSettingsPatch,
  notificationsPort: NotificationsPort,
): Promise<void> {
  await notificationsPort.updateNotificationSettings(telegramId, patch);
}
