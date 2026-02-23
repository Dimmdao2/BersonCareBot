/**
 * Фасад над persistence/repositories/telegramUsers для адаптеров.
 * Граница: adapters → services → persistence.
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
} from '../persistence/repositories/telegramUsers.js';
export type {
  TelegramUserRow,
  NotificationSettings,
  NotificationSettingsPatch,
} from '../persistence/repositories/telegramUsers.js';
