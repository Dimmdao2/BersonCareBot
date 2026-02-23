/**
 * Фасад над persistence/repositories/telegramUsers для адаптеров.
 * Граница: adapters → services → persistence.
 */
export {
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
