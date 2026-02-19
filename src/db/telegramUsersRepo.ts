// src/db/telegramUsersRepo.ts
import { db } from "../db/client.js";
import { logger } from "../logger.js";
import type { TelegramUserFrom } from "../types/telegram.js";

export type TelegramUserRow = {
  id: string;
  telegram_id: string;
};

export async function upsertTelegramUser(
  from: TelegramUserFrom | null | undefined
): Promise<TelegramUserRow | null> {
  if (!from || typeof from.id !== "number") return null;

  const telegramId = String(from.id);
  const username = from.username ?? null;
  const firstName = from.first_name ?? null;
  const lastName = from.last_name ?? null;

  const query = `
    INSERT INTO telegram_users (telegram_id, username, first_name, last_name, created_at)
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (telegram_id)
    DO UPDATE SET
      username = EXCLUDED.username,
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name
    RETURNING id::text AS id, telegram_id::text AS telegram_id;
  `;

  try {
    const res = await db.query<TelegramUserRow>(query, [
      telegramId,
      username,
      firstName,
      lastName,
    ]);
    return res.rows[0] ?? null;
  } catch (err) {
    logger.error({ err }, "upsertTelegramUser error");
    return null;
  }
}

export async function setTelegramUserState(telegramId: string, state: string | null): Promise<void> {
  const query = `
    UPDATE telegram_users
    SET state = $2
    WHERE telegram_id = $1
  `;
  try {
    await db.query(query, [telegramId, state]);
  } catch (err) {
    logger.error({ err }, "setTelegramUserState error");
  }
}

export async function getTelegramUserState(telegramId: string): Promise<string | null> {
  const query = `
    SELECT state FROM telegram_users WHERE telegram_id = $1
  `;
  try {
    const res = await db.query<{ state: string | null }>(query, [telegramId]);
    return res.rows[0]?.state ?? null;
  } catch (err) {
    logger.error({ err }, "getTelegramUserState error");
    return null;
  }
}