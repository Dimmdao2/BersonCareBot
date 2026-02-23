import type { UserPort } from '../ports/user.js';
import type { TelegramUserFrom } from '../types.js';

export async function upsertUser(
  from: TelegramUserFrom | null | undefined,
  port: UserPort,
): Promise<{ id: string; telegram_id: string } | null> {
  return port.upsertTelegramUser(from);
}

export async function tryConsumeStart(telegramId: number, port: UserPort): Promise<boolean> {
  return port.tryConsumeStart(telegramId);
}
