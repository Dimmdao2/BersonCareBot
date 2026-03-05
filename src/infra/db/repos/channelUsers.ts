import type {
  ChannelUserFrom,
  ChannelUserPort,
  ChannelUserRow,
  NotificationSettings,
  NotificationSettingsPatch,
  NotificationsPort,
  DbPort,
} from '../../../kernel/contracts/index.js';
import { logger } from '../../observability/logger.js';

export type ChannelUserByPhone = {
  chatId: number;
  channelId: string;
  username: string | null;
};

export type ChannelUserLinkRow = {
  chatId: number;
  channelId: string;
  username: string | null;
  phoneNormalized: string | null;
};

/** Anti-dup for rapid start events. */
export async function tryConsumeStart(db: DbPort, channelUserId: number): Promise<boolean> {
  const sql = `
    UPDATE telegram_users
    SET last_start_at = now()
    WHERE telegram_id = $1
      AND (last_start_at IS NULL OR last_start_at < now() - interval '5 seconds')
    RETURNING id;
  `;
  try {
    const res = await db.query(sql, [channelUserId]);
    return (res.rowCount ?? 0) > 0;
  } catch (err) {
    logger.error({ err }, 'tryConsumeStart error');
    return false;
  }
}

/** Dedup for incoming channel update_id. */
export async function tryAdvanceLastUpdateId(
  db: DbPort,
  channelUserId: number,
  updateId: number,
): Promise<boolean> {
  const query = `
    UPDATE telegram_users
    SET last_update_id = $2
    WHERE telegram_id = $1
      AND (last_update_id IS NULL OR last_update_id < $2)
  `;
  try {
    const res = await db.query(query, [String(channelUserId), updateId]);
    return res.rowCount === 1;
  } catch (err) {
    logger.error({ err }, 'tryAdvanceLastUpdateId error');
    return false;
  }
}

/** Creates/updates a channel user card. */
export async function upsertUser(
  db: DbPort,
  from: ChannelUserFrom | null | undefined,
): Promise<ChannelUserRow | null> {
  if (!from || typeof from.id !== 'number') return null;

  const channelId = String(from.id);
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
    RETURNING id::text AS id, telegram_id::text AS channel_id;
  `;

  try {
    const res = await db.query<ChannelUserRow>(query, [
      channelId,
      username,
      firstName,
      lastName,
    ]);
    return res.rows[0] ?? null;
  } catch (err) {
    logger.error({ err }, 'upsertUser error');
    return null;
  }
}

/** Sets dialog state for a channel user. */
export async function setUserState(
  db: DbPort,
  channelUserId: string,
  state: string | null,
): Promise<void> {
  const query = `
    UPDATE telegram_users
    SET state = $2
    WHERE telegram_id = $1
  `;
  try {
    await db.query(query, [channelUserId, state]);
  } catch (err) {
    logger.error({ err }, 'setUserState error');
  }
}

/** Reads dialog state for a channel user. */
export async function getUserState(db: DbPort, channelUserId: string): Promise<string | null> {
  const query = `
    SELECT state FROM telegram_users WHERE telegram_id = $1
  `;
  try {
    const res = await db.query<{ state: string | null }>(query, [channelUserId]);
    return res.rows[0]?.state ?? null;
  } catch (err) {
    logger.error({ err }, 'getUserState error');
    return null;
  }
}

/** Partially updates notification settings for a channel user. */
export async function updateNotificationSettings(
  db: DbPort,
  channelUserId: number,
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
    await db.query(query, [String(channelUserId), ...values]);
  } catch (err) {
    logger.error({ err }, 'updateNotificationSettings error');
  }
}

/** Reads notification settings for a channel user. */
export async function getNotificationSettings(
  db: DbPort,
  channelUserId: number,
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
    }>(query, [String(channelUserId)]);

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

/** Finds channel user by normalized phone. */
export async function findByPhone(db: DbPort, phoneNormalized: string): Promise<ChannelUserByPhone | null> {
  const query = `
    SELECT telegram_id::text AS channel_id, username
    FROM telegram_users
    WHERE phone = $1
    LIMIT 1
  `;
  try {
    const res = await db.query<{ channel_id: string; username: string | null }>(query, [phoneNormalized]);
    const row = res.rows[0];
    if (!row) return null;

    const chatId = Number(row.channel_id);
    if (!Number.isFinite(chatId)) return null;

    return {
      chatId,
      channelId: row.channel_id,
      username: row.username,
    };
  } catch (err) {
    logger.error({ err }, 'findByPhone error');
    return null;
  }
}

/** Returns user data needed for linking flows. */
export async function getUserLinkData(
  db: DbPort,
  channelUserId: string,
): Promise<ChannelUserLinkRow | null> {
  const query = `
    SELECT telegram_id::text AS channel_id, username, phone
    FROM telegram_users
    WHERE telegram_id = $1
    LIMIT 1
  `;
  try {
    const res = await db.query<{
      channel_id: string;
      username: string | null;
      phone: string | null;
    }>(query, [channelUserId]);
    const row = res.rows[0];
    if (!row) return null;
    const chatId = Number(row.channel_id);
    if (!Number.isFinite(chatId)) return null;
    return {
      chatId,
      channelId: row.channel_id,
      username: row.username,
      phoneNormalized: row.phone,
    };
  } catch (err) {
    logger.error({ err }, 'getUserLinkData error');
    return null;
  }
}

/** Links phone to a channel user. */
export async function setUserPhone(
  db: DbPort,
  channelUserId: string,
  phoneNormalized: string,
): Promise<void> {
  const query = `
    UPDATE telegram_users
    SET phone = $2
    WHERE telegram_id = $1
  `;
  try {
    await db.query(query, [channelUserId, phoneNormalized]);
  } catch (err) {
    logger.error({ err }, 'setUserPhone error');
  }
}

/** Ready-to-use ChannelUserPort implementation over SQL repository. */
export function createChannelUserPort(db: DbPort): ChannelUserPort & NotificationsPort {
  return {
    upsertUser: (from) => upsertUser(db, from),
    setUserState: (channelUserId, state) => setUserState(db, channelUserId, state),
    setUserPhone: (channelUserId, phoneNormalized) => setUserPhone(db, channelUserId, phoneNormalized),
    getUserState: (channelUserId) => getUserState(db, channelUserId),
    tryAdvanceLastUpdateId: (channelUserId, updateId) => tryAdvanceLastUpdateId(db, channelUserId, updateId),
    tryConsumeStart: (channelUserId) => tryConsumeStart(db, channelUserId),
    getNotificationSettings: (channelUserId) => getNotificationSettings(db, channelUserId),
    updateNotificationSettings: (channelUserId, settings) => updateNotificationSettings(db, channelUserId, settings),
  };
}
