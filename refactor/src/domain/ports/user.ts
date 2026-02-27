/** Контракт работы с пользователем Telegram в хранилище. */
import type { TelegramUserFrom } from '../types.js';

export type TelegramUserRow = { id: string; telegram_id: string };

export type UserPort = {
  /** Создает/обновляет пользователя Telegram по профилю from. */
  upsertTelegramUser(from: TelegramUserFrom | null | undefined): Promise<TelegramUserRow | null>;
  /** Сохраняет текущее состояние пользователя в диалоге. */
  setTelegramUserState(telegramId: string, state: string | null): Promise<void>;
  /** Возвращает текущее состояние пользователя в диалоге. */
  getTelegramUserState(telegramId: string): Promise<string | null>;
  /** Дедупликация webhook-апдейтов по update_id. */
  tryAdvanceLastUpdateId(telegramId: number, updateId: number): Promise<boolean>;
  /** Антидребезг/антидубль для команды /start. */
  tryConsumeStart(telegramId: number): Promise<boolean>;
};
