import { db } from '../client.js';
import { logger } from '../../observability/logger.js';
import type { TelegramUserFrom } from '../../domain/types.js';
import type { UserPort } from '../../domain/ports/user.js';
import type { NotificationsPort } from '../../domain/ports/notifications.js';

export type TelegramUserRow = {
  id: string;
  telegram_id: string;
};

export type NotificationSettings = {
  notify_spb: boolean;
  notify_msk: boolean;
  notify_online: boolean;
};

export type NotificationSettingsPatch = {
  notify_spb?: boolean;
  notify_msk?: boolean;
  notify_online?: boolean;
};

export type TelegramUserByPhone = {
  chatId: number;
  telegramId: string;
  username: string | null;
};

export type TelegramUserLinkRow = {
  chatId: number;
  telegramId: string;
  username: string | null;
  phoneNormalized: string | null;
};

export async function tryConsumeStart(telegramId: number): Promise<boolean> {
  const sql = `
    UPDATE telegram_users
    SET last_start_at = now()
    WHERE telegram_id = $1
      AND (last_start_at IS NULL OR last_start_at < now() - interval '5 seconds')
    RETURNING id;
  `;
  try {
    const res = await db.query(sql, [telegramId]);
    return (res.rowCount ?? 0) > 0;
  } catch (err) {
    logger.error({ err }, 'tryConsumeStart error');
    return false;
  }
}

export async function tryAdvanceLastUpdateId(
  telegramId: number,
  updateId: number,
): Promise<boolean> {
  const query = `
    UPDATE telegram_users
    SET last_update_id = $2
    WHERE telegram_id = $1
      AND (last_update_id IS NULL OR last_update_id < $2)
  `;
  try {
    const res = await db.query(query, [String(telegramId), updateId]);
    return res.rowCount === 1;
  } catch (err) {
    logger.error({ err }, 'tryAdvanceLastUpdateId error');
    return false;
  }
}

export async function upsertTelegramUser(
  from: TelegramUserFrom | null | undefined,
): Promise<TelegramUserRow | null> {
  if (!from || typeof from.id !== 'number') return null;

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
    logger.error({ err }, 'upsertTelegramUser error');
    return null;
  }
}

export async function setTelegramUserState(
  telegramId: string,
  state: string | null,
): Promise<void> {
  const query = `
    UPDATE telegram_users
    SET state = $2
    WHERE telegram_id = $1
  `;
  try {
    await db.query(query, [telegramId, state]);
  } catch (err) {
    logger.error({ err }, 'setTelegramUserState error');
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
    logger.error({ err }, 'getTelegramUserState error');
    return null;
  }
}

export async function updateNotificationSettings(
  telegramId: number,
  settings: NotificationSettingsPatch,
): Promise<void> {
  const fields: string[] = [];
  const values: boolean[] = [];
  let idx = 2;

  if (typeof settings.notify_spb === 'boolean') {
    fields.push(`notify_spb = $${idx}`);
    values.push(settings.notify_spb);
    idx++;
  }

  if (typeof settings.notify_msk === 'boolean') {
    fields.push(`notify_msk = $${idx}`);
    values.push(settings.notify_msk);
    idx++;
  }

  if (typeof settings.notify_online === 'boolean') {
    fields.push(`notify_online = $${idx}`);
    values.push(settings.notify_online);
  }

  if (fields.length === 0) return;

  const query = `UPDATE telegram_users SET ${fields.join(', ')} WHERE telegram_id = $1`;

  try {
    await db.query(query, [String(telegramId), ...values]);
  } catch (err) {
    logger.error({ err }, 'updateNotificationSettings error');
  }
}

export async function getNotificationSettings(
  telegramId: number,
): Promise<NotificationSettings | null> {
  const query = `
    SELECT notify_spb, notify_msk, notify_online
    FROM telegram_users
    WHERE telegram_id = $1
  `;

  try {
    const res = await db.query<{
      notify_spb: boolean | null;
      notify_msk: boolean | null;
      notify_online: boolean | null;
    }>(query, [String(telegramId)]);

    const row = res.rows[0];
    if (!row) return null;

    return {
      notify_spb: Boolean(row.notify_spb),
      notify_msk: Boolean(row.notify_msk),
      notify_online: Boolean(row.notify_online),
    };
  } catch (err) {
    logger.error({ err }, 'getNotificationSettings error');
    return null;
  }
}

export async function findByPhone(phoneNormalized: string): Promise<TelegramUserByPhone | null> {
  const query = `
    SELECT telegram_id::text AS telegram_id, username
    FROM telegram_users
    WHERE phone = $1
    LIMIT 1
  `;
  try {
    const res = await db.query<{ telegram_id: string; username: string | null }>(query, [phoneNormalized]);
    const row = res.rows[0];
    if (!row) return null;

    const chatId = Number(row.telegram_id);
    if (!Number.isFinite(chatId)) return null;

    return {
      chatId,
      telegramId: row.telegram_id,
      username: row.username,
    };
  } catch (err) {
    logger.error({ err }, 'findByPhone error');
    return null;
  }
}

export async function getTelegramUserLinkData(
  telegramId: string,
): Promise<TelegramUserLinkRow | null> {
  const query = `
    SELECT telegram_id::text AS telegram_id, username, phone
    FROM telegram_users
    WHERE telegram_id = $1
    LIMIT 1
  `;
  try {
    const res = await db.query<{
      telegram_id: string;
      username: string | null;
      phone: string | null;
    }>(query, [telegramId]);
    const row = res.rows[0];
    if (!row) return null;
    const chatId = Number(row.telegram_id);
    if (!Number.isFinite(chatId)) return null;
    return {
      chatId,
      telegramId: row.telegram_id,
      username: row.username,
      phoneNormalized: row.phone,
    };
  } catch (err) {
    logger.error({ err }, 'getTelegramUserLinkData error');
    return null;
  }
}

export async function setTelegramUserPhone(
  telegramId: string,
  phoneNormalized: string,
): Promise<void> {
  const query = `
    UPDATE telegram_users
    SET phone = $2
    WHERE telegram_id = $1
  `;
  try {
    await db.query(query, [telegramId, phoneNormalized]);
  } catch (err) {
    logger.error({ err }, 'setTelegramUserPhone error');
  }
}

export const userPort: UserPort = {
  upsertTelegramUser,
  setTelegramUserState,
  getTelegramUserState,
  tryAdvanceLastUpdateId,
  tryConsumeStart,
};

export const notificationsPort: NotificationsPort = {
  getNotificationSettings,
  updateNotificationSettings,
};
