import type {
  NotificationSettings,
  NotificationSettingsPatch,
  NotificationsPort,
} from '../ports/notifications.js';

export async function getSettings(
  telegramId: number,
  port: NotificationsPort,
): Promise<NotificationSettings> {
  const s = await port.getNotificationSettings(telegramId);
  return s ?? { notify_spb: false, notify_msk: false, notify_online: false };
}

export async function updateSettings(
  telegramId: number,
  patch: NotificationSettingsPatch,
  port: NotificationsPort,
): Promise<void> {
  await port.updateNotificationSettings(telegramId, patch);
}
