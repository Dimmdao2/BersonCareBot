/**
 * Порты ядра — контракты «что нужно ядру» без привязки к БД и Telegram.
 * Реализации: persistence/repositories (UserPort, NotificationsPort), adapters/telegram/client (MessagingPort).
 */
export type { UserPort, TelegramUserRow } from './user.js';
export type {
  NotificationsPort,
  NotificationSettings,
  NotificationSettingsPatch,
} from './notifications.js';
export type { MessagingPort } from './messaging.js';
