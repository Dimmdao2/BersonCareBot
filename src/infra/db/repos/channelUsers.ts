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
    UPDATE telegram_state ts
    SET last_start_at = now(), updated_at = now()
    FROM identities i
    WHERE ts.identity_id = i.id
      AND i.resource = 'telegram'
      AND i.external_id = $1
      AND (ts.last_start_at IS NULL OR ts.last_start_at < now() - interval '5 seconds')
    RETURNING ts.identity_id;
  `;
  try {
    const res = await db.query(sql, [String(channelUserId)]);
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
    UPDATE telegram_state ts
    SET last_update_id = $2, updated_at = now()
    FROM identities i
    WHERE ts.identity_id = i.id
      AND i.resource = 'telegram'
      AND i.external_id = $1
      AND (ts.last_update_id IS NULL OR ts.last_update_id < $2)
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
    WITH existing_identity AS (
      SELECT i.id, i.user_id
      FROM identities i
      WHERE i.resource = 'telegram'
        AND i.external_id = $1
      LIMIT 1
    ),
    new_user AS (
      INSERT INTO users (created_at, updated_at)
      SELECT now(), now()
      WHERE NOT EXISTS (SELECT 1 FROM existing_identity)
      RETURNING id
    ),
    resolved_user AS (
      SELECT user_id FROM existing_identity
      UNION ALL
      SELECT id AS user_id FROM new_user
      LIMIT 1
    ),
    upsert_identity AS (
      INSERT INTO identities (user_id, resource, external_id, created_at, updated_at)
      SELECT ru.user_id, 'telegram', $1, now(), now()
      FROM resolved_user ru
      ON CONFLICT (resource, external_id)
      DO UPDATE SET
        updated_at = now()
      RETURNING id, user_id
    ),
    resolved_identity AS (
      SELECT id, user_id FROM existing_identity
      UNION ALL
      SELECT id, user_id FROM upsert_identity
      LIMIT 1
    ),
    upsert_state AS (
      INSERT INTO telegram_state (
        identity_id,
        username,
        first_name,
        last_name,
        created_at,
        updated_at
      )
      SELECT ri.id, $2, $3, $4, now(), now()
      FROM resolved_identity ri
      ON CONFLICT (identity_id)
      DO UPDATE SET
        username = EXCLUDED.username,
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        updated_at = now()
    ),
    mirror_legacy AS (
      INSERT INTO telegram_users (telegram_id, username, first_name, last_name, created_at, updated_at)
      VALUES ($1::bigint, $2, $3, $4, now(), now())
      ON CONFLICT (telegram_id)
      DO UPDATE SET
        username = EXCLUDED.username,
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        updated_at = now()
    )
    SELECT ri.user_id::text AS id, $1::text AS channel_id
    FROM resolved_identity ri;
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
    WITH target_identity AS (
      SELECT i.id
      FROM identities i
      WHERE i.resource = 'telegram'
        AND i.external_id = $1
      LIMIT 1
    ),
    upsert_state AS (
      INSERT INTO telegram_state (identity_id, state, created_at, updated_at)
      SELECT ti.id, $2, now(), now()
      FROM target_identity ti
      ON CONFLICT (identity_id)
      DO UPDATE SET
        state = EXCLUDED.state,
        updated_at = now()
    )
    UPDATE telegram_users
    SET state = $2,
        updated_at = now()
    WHERE telegram_id = $1::bigint
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
    SELECT ts.state
    FROM identities i
    LEFT JOIN telegram_state ts
      ON ts.identity_id = i.id
    WHERE i.resource = 'telegram'
      AND i.external_id = $1
    LIMIT 1
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
  const columns: string[] = [];
  const updateClauses: string[] = [];
  const values: boolean[] = [];
  let idx = 2;

  if (typeof settings.notify_spb === 'boolean') {
    columns.push('notify_spb');
    updateClauses.push(`notify_spb = $${idx}`);
    values.push(settings.notify_spb);
    idx++;
  }

  if (typeof settings.notify_msk === 'boolean') {
    columns.push('notify_msk');
    updateClauses.push(`notify_msk = $${idx}`);
    values.push(settings.notify_msk);
    idx++;
  }

  if (typeof settings.notify_online === 'boolean') {
    columns.push('notify_online');
    updateClauses.push(`notify_online = $${idx}`);
    values.push(settings.notify_online);
  }

  if (columns.length === 0) return;

  const updateFromExcluded = columns.map((column) => `${column} = EXCLUDED.${column}`);
  const updateLegacyClauses = [...updateClauses, 'updated_at = now()'];

  const query = `
    WITH target_identity AS (
      SELECT i.id
      FROM identities i
      WHERE i.resource = 'telegram'
        AND i.external_id = $1
      LIMIT 1
    ),
    upsert_state AS (
      INSERT INTO telegram_state (
        identity_id,
        ${columns.join(', ')},
        created_at,
        updated_at
      )
      SELECT ti.id, ${values.map((_, index) => `$${index + 2}`).join(', ')}, now(), now()
      FROM target_identity ti
      ON CONFLICT (identity_id)
      DO UPDATE SET
        ${updateFromExcluded.join(', ')},
        updated_at = now()
    )
    UPDATE telegram_users
    SET ${updateLegacyClauses.join(', ')}
    WHERE telegram_id = $1::bigint
  `;

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
    SELECT ts.notify_spb, ts.notify_msk, ts.notify_online
    FROM identities i
    LEFT JOIN telegram_state ts
      ON ts.identity_id = i.id
    WHERE i.resource = 'telegram'
      AND i.external_id = $1
    LIMIT 1
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
    SELECT i.external_id::text AS channel_id, ts.username
    FROM contacts c
    JOIN identities i
      ON i.user_id = c.user_id
     AND i.resource = 'telegram'
    LEFT JOIN telegram_state ts
      ON ts.identity_id = i.id
    WHERE c.type = 'phone'
      AND c.value_normalized = $1
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
    SELECT i.external_id::text AS channel_id, ts.username, cp.phone
    FROM identities i
    LEFT JOIN telegram_state ts
      ON ts.identity_id = i.id
    LEFT JOIN LATERAL (
      SELECT c.value_normalized AS phone
      FROM contacts c
      WHERE c.user_id = i.user_id
        AND c.type = 'phone'
      ORDER BY c.is_primary DESC NULLS LAST, c.id ASC
      LIMIT 1
    ) cp ON true
    WHERE i.resource = 'telegram'
      AND i.external_id = $1
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
    WITH target_identity AS (
      SELECT i.user_id
      FROM identities i
      WHERE i.resource = 'telegram'
        AND i.external_id = $1
      LIMIT 1
    ),
    upsert_contact AS (
      INSERT INTO contacts (user_id, type, value_normalized, label, is_primary, created_at, updated_at)
      SELECT ti.user_id, 'phone', $2, 'telegram', NULL, now(), now()
      FROM target_identity ti
      ON CONFLICT (type, value_normalized)
      DO UPDATE SET
        user_id = EXCLUDED.user_id,
        label = EXCLUDED.label,
        updated_at = now()
    )
    UPDATE telegram_users
    SET phone = $2,
        updated_at = now()
    WHERE telegram_id = $1::bigint
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
