import type {
  ChannelUserFrom,
  ChannelUserPort,
  ChannelUserRow,
  NotificationSettings,
  NotificationSettingsPatch,
  NotificationsPort,
  DbPort,
  SetUserPhoneOutcome,
} from '../../../kernel/contracts/index.js';
import { logger } from '../../observability/logger.js';
import { resolveCanonicalIntegratorUserId } from './canonicalUserId.js';

export type ChannelUserByPhone = {
  chatId: number;
  channelId: string;
  username: string | null;
};

export type ChannelUserLinkRow = {
  userId: string;
  chatId: number;
  channelId: string;
  username: string | null;
  phoneNormalized: string | null;
  userState: string | null;
};

/** Окно подавления повторного «голого» /start (другой `update_id`, тот же смысл). Не путать с gateway dedup по `update_id`. */
export const TELEGRAM_START_DEBOUNCE_SECONDS = 3;

/**
 * Anti-dup for rapid «голый» /start (legacy handleStart + orchestrator `telegramStartDedup`).
 * Returns false only when the same Telegram user already had /start within the debounce window.
 *
 * If there is no `identities`/`telegram_state` row yet (e.g. integrator user was purged), the UPDATE
 * touches 0 rows — that must **not** block onboarding; otherwise the pipeline drops /start silently.
 */
export async function tryConsumeStart(db: DbPort, channelUserId: number): Promise<boolean> {
  const externalId = String(channelUserId);
  const debounceSec = TELEGRAM_START_DEBOUNCE_SECONDS;
  const updateSql = `
    UPDATE telegram_state ts
    SET last_start_at = now(), updated_at = now()
    FROM identities i
    WHERE ts.identity_id = i.id
      AND i.resource = 'telegram'
      AND i.external_id = $1
      AND (ts.last_start_at IS NULL OR ts.last_start_at < now() - ($2::int * interval '1 second'))
    RETURNING ts.identity_id;
  `;
  try {
    const res = await db.query(updateSql, [externalId, debounceSec]);
    if ((res.rowCount ?? 0) > 0) return true;

    const recentSql = `
      SELECT 1
      FROM telegram_state ts
      INNER JOIN identities i ON ts.identity_id = i.id
      WHERE i.resource = 'telegram'
        AND i.external_id = $1
        AND ts.last_start_at IS NOT NULL
        AND ts.last_start_at >= now() - ($2::int * interval '1 second')
      LIMIT 1
    `;
    const recent = await db.query(recentSql, [externalId, debounceSec]);
    if ((recent.rowCount ?? 0) > 0) return false;

    return true;
  } catch (err) {
    // Fail-open: denying here drops the whole Telegram pipeline (silent /start). Prefer a possible
    // duplicate welcome over a bricked chat when the DB hiccups.
    logger.error({ err }, 'tryConsumeStart error');
    return true;
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
      RETURNING *
    )
    SELECT 1 FROM upsert_state
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
  const values: boolean[] = [];

  if (typeof settings.notify_spb === 'boolean') {
    columns.push('notify_spb');
    values.push(settings.notify_spb);
  }

  if (typeof settings.notify_msk === 'boolean') {
    columns.push('notify_msk');
    values.push(settings.notify_msk);
  }

  if (typeof settings.notify_online === 'boolean') {
    columns.push('notify_online');
    values.push(settings.notify_online);
  }

  if (typeof settings.notify_bookings === 'boolean') {
    columns.push('notify_bookings');
    values.push(settings.notify_bookings);
  }

  if (columns.length === 0) return;

  const updateFromExcluded = columns.map((column) => `${column} = EXCLUDED.${column}`);
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
      RETURNING *
    )
    SELECT 1 FROM upsert_state
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
    SELECT ts.notify_spb, ts.notify_msk, ts.notify_online, ts.notify_bookings
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
      notify_bookings: boolean | null;
    }>(query, [String(channelUserId)]);

    const row = res.rows[0];
    if (!row) return null;

    return {
      notify_spb: Boolean(row.notify_spb),
      notify_msk: Boolean(row.notify_msk),
      notify_online: Boolean(row.notify_online),
      notify_bookings: Boolean(row.notify_bookings),
    };
  } catch (err) {
    logger.error({ err }, 'getNotificationSettings error');
    return null;
  }
}

/** Finds channel user by normalized phone (Telegram only; for backward compat). */
export async function findByPhone(db: DbPort, phoneNormalized: string): Promise<ChannelUserByPhone | null> {
  return findByIdentityByPhone(db, phoneNormalized, 'telegram');
}

/**
 * Finds identity for a user identified by phone, for the given resource.
 * Returns link data (channelId, chatId when numeric) or null if no identity for that resource.
 */
export async function findByIdentityByPhone(
  db: DbPort,
  phoneNormalized: string,
  resource: string,
): Promise<ChannelUserByPhone | null> {
  if (resource === 'telegram' || resource === 'channel') {
    const query = `
      SELECT i.external_id::text AS channel_id, ts.username
      FROM contacts c
      JOIN identities i ON i.user_id = c.user_id AND i.resource = 'telegram'
      LEFT JOIN telegram_state ts ON ts.identity_id = i.id
      WHERE c.type = 'phone' AND c.value_normalized = $1
      LIMIT 1
    `;
    try {
      const res = await db.query<{ channel_id: string; username: string | null }>(query, [phoneNormalized]);
      const row = res.rows[0];
      if (!row) return null;
      const chatId = Number(row.channel_id);
      if (!Number.isFinite(chatId)) return null;
      return { chatId, channelId: row.channel_id, username: row.username };
    } catch (err) {
      logger.error({ err }, 'findByIdentityByPhone telegram error');
      return null;
    }
  }

  const query = `
    SELECT i.external_id::text AS channel_id
    FROM contacts c
    JOIN identities i ON i.user_id = c.user_id AND i.resource = $2
    WHERE c.type = 'phone' AND c.value_normalized = $1
    LIMIT 1
  `;
  try {
    const res = await db.query<{ channel_id: string }>(query, [phoneNormalized, resource]);
    const row = res.rows[0];
    if (!row) return null;
    const chatId = Number(row.channel_id);
    return {
      chatId: Number.isFinite(chatId) ? chatId : 0,
      channelId: row.channel_id,
      username: null,
    };
  } catch (err) {
    logger.error({ err }, 'findByIdentityByPhone error');
    return null;
  }
}

/** Returns user data needed for linking flows (Telegram-only; state from telegram_state). */
export async function getUserLinkData(
  db: DbPort,
  channelUserId: string,
): Promise<ChannelUserLinkRow | null> {
  return getLinkDataByIdentity(db, 'telegram', channelUserId);
}

/**
 * Returns user/link data by (resource, external_id). State and profile come from
 * integration-specific tables when available (e.g. telegram_state); otherwise identities + contacts only.
 *
 * Phone for `linkedPhone` / orchestrator: **webapp canon first** — `public.platform_users.phone_normalized`
 * via `public.user_channel_bindings` for this channel, resolving `merged_into_id` to the surviving row;
 * if empty, falls back to integrator `contacts` with `label` equal to this **resource** (legacy / repair).
 * Any other phone on the user (e.g. merged from web without messenger label) must **not** skip `/start`
 * onboarding in the bot.
 */
export async function getLinkDataByIdentity(
  db: DbPort,
  resource: string,
  externalId: string,
): Promise<ChannelUserLinkRow | null> {
  if (resource === 'telegram') {
    /* eslint-disable-next-line no-secrets/no-secrets -- SQL query text */
    const query = `
      SELECT i.user_id::text AS user_id, i.external_id::text AS channel_id, ts.username, ts.state AS user_state,
             COALESCE(NULLIF(TRIM(pub.phone_normalized), ''), cp.phone) AS phone
      FROM identities i
      LEFT JOIN telegram_state ts ON ts.identity_id = i.id
      LEFT JOIN LATERAL (
        WITH RECURSIVE pu_chain AS (
          SELECT pu.id, pu.phone_normalized, pu.merged_into_id
          FROM public.user_channel_bindings ucb
          INNER JOIN public.platform_users pu ON pu.id = ucb.user_id
          WHERE ucb.channel_code = i.resource AND ucb.external_id = i.external_id
          UNION ALL
          SELECT p.id, p.phone_normalized, p.merged_into_id
          FROM public.platform_users p
          INNER JOIN pu_chain c ON p.id = c.merged_into_id
        )
        SELECT phone_normalized
        FROM pu_chain
        WHERE merged_into_id IS NULL
        LIMIT 1
      ) pub ON true
      LEFT JOIN LATERAL (
        SELECT c.value_normalized AS phone
        FROM contacts c
        WHERE c.user_id = i.user_id AND c.type = 'phone' AND c.label = $1
        ORDER BY c.is_primary DESC NULLS LAST, c.id ASC
        LIMIT 1
      ) cp ON true
      WHERE i.resource = $1 AND i.external_id = $2
      LIMIT 1
    `;
    try {
      const res = await db.query<{
        user_id: string;
        channel_id: string;
        username: string | null;
        user_state: string | null;
        phone: string | null;
      }>(query, [resource, externalId]);
      const row = res.rows[0];
      if (!row) return null;
      const chatId = Number(row.channel_id);
      // Like the Max branch below: never drop the row when external_id does not parse as a finite
      // number — userId/phoneNormalized are still valid (projection, linkedPhone, admin-facing reads).
      return {
        userId: row.user_id,
        chatId: Number.isFinite(chatId) ? chatId : 0,
        channelId: row.channel_id,
        username: row.username,
        phoneNormalized: row.phone,
        userState: row.user_state,
      };
    } catch (err) {
      logger.error({ err }, 'getLinkDataByIdentity telegram error');
      return null;
    }
  }

  /* eslint-disable-next-line no-secrets/no-secrets -- SQL query text */
  const query = `
    SELECT i.user_id::text AS user_id, i.external_id::text AS channel_id,
           COALESCE(NULLIF(TRIM(pub.phone_normalized), ''), cp.phone) AS phone
    FROM identities i
    LEFT JOIN LATERAL (
      WITH RECURSIVE pu_chain AS (
        SELECT pu.id, pu.phone_normalized, pu.merged_into_id
        FROM public.user_channel_bindings ucb
        INNER JOIN public.platform_users pu ON pu.id = ucb.user_id
        WHERE ucb.channel_code = i.resource AND ucb.external_id = i.external_id
        UNION ALL
        SELECT p.id, p.phone_normalized, p.merged_into_id
        FROM public.platform_users p
        INNER JOIN pu_chain c ON p.id = c.merged_into_id
      )
      SELECT phone_normalized
      FROM pu_chain
      WHERE merged_into_id IS NULL
      LIMIT 1
    ) pub ON true
    LEFT JOIN LATERAL (
      SELECT c.value_normalized AS phone
      FROM contacts c
      WHERE c.user_id = i.user_id AND c.type = 'phone' AND c.label = $1
      ORDER BY c.is_primary DESC NULLS LAST, c.id ASC
      LIMIT 1
    ) cp ON true
    WHERE i.resource = $1 AND i.external_id = $2
    LIMIT 1
  `;
  try {
    const res = await db.query<{ user_id: string; channel_id: string; phone: string | null }>(query, [resource, externalId]);
    const row = res.rows[0];
    if (!row) return null;
    const chatId = Number(row.channel_id);
    return {
      userId: row.user_id,
      chatId: Number.isFinite(chatId) ? chatId : 0,
      channelId: row.channel_id,
      username: null,
      phoneNormalized: row.phone,
      userState: null,
    };
  } catch (err) {
    logger.error({ err }, 'getLinkDataByIdentity error');
    return null;
  }
}

/** Returns all channel identities for a given userId (telegram + max). */
export async function getChannelIdsByUserId(
  db: DbPort,
  userId: string,
): Promise<Array<{ resource: string; externalId: string; chatId: number }>> {
  const query = `
    SELECT i.resource, i.external_id::text AS external_id
    FROM identities i
    WHERE i.user_id = $1 AND i.resource IN ('telegram', 'max')
    ORDER BY i.resource ASC
  `;
  try {
    const res = await db.query<{ resource: string; external_id: string }>(query, [userId]);
    return res.rows.map((row) => {
      const chatId = Number(row.external_id);
      return {
        resource: row.resource,
        externalId: row.external_id,
        chatId: Number.isFinite(chatId) ? chatId : 0,
      };
    }).filter((row) => row.chatId > 0);
  } catch {
    return [];
  }
}

/** Returns identity id by (resource, external_id) for use when drafting needs it. */
export async function getIdentityIdByResourceAndExternalId(
  db: DbPort,
  resource: string,
  externalId: string,
): Promise<string | null> {
  const query = `SELECT i.id::text FROM identities i WHERE i.resource = $1 AND i.external_id = $2 LIMIT 1`;
  const res = await db.query<{ id: string }>(query, [resource, externalId]);
  const row = res.rows[0];
  return row?.id ?? null;
}

/**
 * Links phone to a channel user. Safe against takeover: if the phone is already linked to another
 * user, the update is not applied (idempotent re-link only for the same user).
 */
export async function setUserPhone(
  db: DbPort,
  channelUserId: string,
  phoneNormalized: string,
  resource: string = "telegram",
): Promise<SetUserPhoneOutcome> {
  const idRes = await db.query<{ user_id: string }>(
    `SELECT i.user_id::text AS user_id
     FROM identities i
     WHERE i.resource = $2
       AND i.external_id = $1
     LIMIT 1`,
    [channelUserId, resource],
  );
  const rawUserId = idRes.rows[0]?.user_id;
  if (!rawUserId) return 'failed';

  const userId = await resolveCanonicalIntegratorUserId(db, rawUserId);

  const query = `
    INSERT INTO contacts (user_id, type, value_normalized, label, is_primary, created_at, updated_at)
    VALUES ($1::bigint, 'phone', $2, $3, NULL, now(), now())
    ON CONFLICT (type, value_normalized)
    DO UPDATE SET
      user_id = EXCLUDED.user_id,
      label = EXCLUDED.label,
      updated_at = now()
    WHERE contacts.user_id = $1::bigint
  `;
  try {
    const res = await db.query(query, [userId, phoneNormalized, resource]);
    return (res.rowCount ?? 0) > 0 ? 'applied' : 'noop_conflict';
  } catch (err) {
    logger.error({ err }, 'setUserPhone error');
    return 'failed';
  }
}

/** Ready-to-use ChannelUserPort implementation over SQL repository. */
export function createChannelUserPort(db: DbPort): ChannelUserPort & NotificationsPort {
  return {
    upsertUser: (from) => upsertUser(db, from),
    setUserState: (channelUserId, state) => setUserState(db, channelUserId, state),
    setUserPhone: (channelUserId, phoneNormalized) =>
      setUserPhone(db, channelUserId, phoneNormalized, "telegram"),
    getUserState: (channelUserId) => getUserState(db, channelUserId),
    tryAdvanceLastUpdateId: (channelUserId, updateId) => tryAdvanceLastUpdateId(db, channelUserId, updateId),
    tryConsumeStart: (channelUserId) => tryConsumeStart(db, channelUserId),
    getNotificationSettings: (channelUserId) => getNotificationSettings(db, channelUserId),
    updateNotificationSettings: (channelUserId, settings) => updateNotificationSettings(db, channelUserId, settings),
  };
}
