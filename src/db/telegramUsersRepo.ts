// src/db/telegramUsersRepo.ts
import { db } from "../db/client.js";
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
    console.error("upsertTelegramUser error:", err);
    return null;
  }
}