/**
 * Порты ядра — контракты «что нужно ядру» без привязки к БД и Telegram.
 * Реализации: persistence/repositories (UserPort, NotificationsPort), adapters/telegram/client (MessagingPort via grammy).
 */
export type { UserPort, TelegramUserRow } from './user.js';
export type {
  NotificationsPort,
  NotificationSettings,
  NotificationSettingsPatch,
} from './notifications.js';
export type { MessagingPort } from './messaging.js';
