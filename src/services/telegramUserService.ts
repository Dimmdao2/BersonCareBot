/**
 * Фасад над db/repos/telegramUsers для адаптеров.
 * Граница: adapters → services → db.
 * Реализации портов ядра: userPort, notificationsPort (репозиторий как порт).
 */
export {
  userPort,
  notificationsPort,
  upsertTelegramUser,
  setTelegramUserState,
  getTelegramUserState,
  getNotificationSettings,
  updateNotificationSettings,
  tryAdvanceLastUpdateId,
  tryConsumeStart,
} from '../db/repos/telegramUsers.js';
export type {
  TelegramUserRow,
  NotificationSettings,
  NotificationSettingsPatch,
} from '../db/repos/telegramUsers.js';
