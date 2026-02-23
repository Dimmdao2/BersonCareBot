/**
 * Фасад над telegramUsersRepo для маршрутов.
 * routes → services → repositories.
 */
import {
  upsertTelegramUser as repoUpsert,
  setTelegramUserState as repoSetState,
  getTelegramUserState as repoGetState,
  getNotificationSettings as repoGetSettings,
  updateNotificationSettings as repoUpdateSettings,
  tryAdvanceLastUpdateId as repoTryAdvanceUpdateId,
  tryConsumeStart as repoTryConsumeStart,
} from '../db/telegramUsersRepo.js';

export const upsertTelegramUser = repoUpsert;
export const setTelegramUserState = repoSetState;
export const getTelegramUserState = repoGetState;
export const getNotificationSettings = repoGetSettings;
export const updateNotificationSettings = repoUpdateSettings;
export const tryAdvanceLastUpdateId = repoTryAdvanceUpdateId;
export const tryConsumeStart = repoTryConsumeStart;
