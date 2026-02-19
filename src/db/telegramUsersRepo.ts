import { db } from '../db/client.js';

export async function upsertTelegramUser(from: any) {
  if (!from || !from.id) return null;

  // Ensure telegram_id is string for bigint safety
  const telegram_id = typeof from.id === 'bigint' ? from.id.toString() : String(from.id);
  const username = from.username ?? null;
  const first_name = from.first_name ?? null;
  const last_name = from.last_name ?? null;

  const query = `
    INSERT INTO telegram_users (telegram_id, username, first_name, last_name, created_at)
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (telegram_id)
    DO UPDATE SET
      username = EXCLUDED.username,
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name
    RETURNING id, telegram_id;
  `;

  try {
    const res = await db.query(query, [telegram_id, username, first_name, last_name]);
    return res.rows[0];
  } catch (err) {
    // Log error, do not throw
    console.error('upsertTelegramUser error:', err);
    return null;
  }
}
