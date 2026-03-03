import type { TelegramUserFrom } from '../types.js';

export type TelegramUserRow = { id: string; telegram_id: string };

export type UserPort = {
  upsertTelegramUser(from: TelegramUserFrom | null | undefined): Promise<TelegramUserRow | null>;
  setTelegramUserState(telegramId: string, state: string | null): Promise<void>;
  getTelegramUserState(telegramId: string): Promise<string | null>;
  tryAdvanceLastUpdateId(telegramId: number, updateId: number): Promise<boolean>;
  tryConsumeStart(telegramId: number): Promise<boolean>;
};
