import type { TelegramUserFrom } from '../types.js';

/** User storage contract used by Telegram-related legacy flows. */
export type TelegramUserRow = { id: string; telegram_id: string };

export type UserPort = {
  upsertTelegramUser(from: TelegramUserFrom | null | undefined): Promise<TelegramUserRow | null>;
  setTelegramUserState(telegramId: string, state: string | null): Promise<void>;
  setTelegramUserPhone(telegramId: string, phoneNormalized: string): Promise<void>;
  getTelegramUserState(telegramId: string): Promise<string | null>;
  tryAdvanceLastUpdateId(telegramId: number, updateId: number): Promise<boolean>;
  tryConsumeStart(telegramId: number): Promise<boolean>;
};
