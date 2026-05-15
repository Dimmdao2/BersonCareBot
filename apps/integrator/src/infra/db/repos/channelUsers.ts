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
import {
  getIntegratorLinkedPhoneSource,
  resolveLinkedPhoneNormalized,
} from './linkedPhoneSource.js';
import { sql } from 'drizzle-orm';
import { runIntegratorSql } from '../runIntegratorSql.js';

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
  try {
    const res = await runIntegratorSql<{ identity_id: string }>(db, sql`
    UPDATE telegram_state ts
    SET last_start_at = now(), updated_at = now()
    FROM identities i
    WHERE ts.identity_id = i.id
      AND i.resource = 'telegram'
      AND i.external_id = ${externalId}
      AND (ts.last_start_at IS NULL OR ts.last_start_at < now() - (${debounceSec}::int * interval '1 second'))
    RETURNING ts.identity_id
  `);
    if ((res.rowCount ?? 0) > 0) return true;

    const recent = await runIntegratorSql(db, sql`
      SELECT 1
      FROM telegram_state ts
      INNER JOIN identities i ON ts.identity_id = i.id
      WHERE i.resource = 'telegram'
        AND i.external_id = ${externalId}
        AND ts.last_start_at IS NOT NULL
        AND ts.last_start_at >= now() - (${debounceSec}::int * interval '1 second')
      LIMIT 1
    `);
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
  try {
    const res = await runIntegratorSql(db, sql`
    UPDATE telegram_state ts
    SET last_update_id = ${updateId}, updated_at = now()
    FROM identities i
    WHERE ts.identity_id = i.id
      AND i.resource = 'telegram'
      AND i.external_id = ${String(channelUserId)}
      AND (ts.last_update_id IS NULL OR ts.last_update_id < ${updateId})
  `);
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

  try {
    const res = await runIntegratorSql<ChannelUserRow>(db, sql`
    WITH existing_identity AS (
      SELECT i.id, i.user_id
      FROM identities i
      WHERE i.resource = 'telegram'
        AND i.external_id = ${channelId}
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
      SELECT ru.user_id, 'telegram', ${channelId}, now(), now()
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
      SELECT ri.id, ${username}, ${firstName}, ${lastName}, now(), now()
      FROM resolved_identity ri
      ON CONFLICT (identity_id)
      DO UPDATE SET
        username = EXCLUDED.username,
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        updated_at = now()
    )
    SELECT ri.user_id::text AS id, ${channelId}::text AS channel_id
    FROM resolved_identity ri
  `);
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
  try {
    await runIntegratorSql(db, sql`
    WITH target_identity AS (
      SELECT i.id
      FROM identities i
      WHERE i.resource = 'telegram'
        AND i.external_id = ${channelUserId}
      LIMIT 1
    ),
    upsert_state AS (
      INSERT INTO telegram_state (identity_id, state, created_at, updated_at)
      SELECT ti.id, ${state}, now(), now()
      FROM target_identity ti
      ON CONFLICT (identity_id)
      DO UPDATE SET
        state = EXCLUDED.state,
        updated_at = now()
      RETURNING *
    )
    SELECT 1 FROM upsert_state
  `);
  } catch (err) {
    logger.error({ err }, 'setUserState error');
  }
}

/** Reads dialog state for a channel user. */
export async function getUserState(db: DbPort, channelUserId: string): Promise<string | null> {
  try {
    const res = await runIntegratorSql<{ state: string | null }>(db, sql`
    SELECT ts.state
    FROM identities i
    LEFT JOIN telegram_state ts
      ON ts.identity_id = i.id
    WHERE i.resource = 'telegram'
      AND i.external_id = ${channelUserId}
    LIMIT 1
  `);
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

  const insertColList = sql.join(columns.map((c) => sql.raw(c)), sql.raw(', '));
  const insertValList = sql.join(values.map((v) => sql`${v}`), sql.raw(', '));
  const updateSet = sql.join(
    columns.map((c) => sql.raw(`${c} = EXCLUDED.${c}`)),
    sql.raw(', '),
  );

  try {
    await runIntegratorSql(db, sql`
    WITH target_identity AS (
      SELECT i.id
      FROM identities i
      WHERE i.resource = 'telegram'
        AND i.external_id = ${String(channelUserId)}
      LIMIT 1
    ),
    upsert_state AS (
      INSERT INTO telegram_state (
        identity_id,
        ${insertColList},
        created_at,
        updated_at
      )
      SELECT ti.id, ${insertValList}, now(), now()
      FROM target_identity ti
      ON CONFLICT (identity_id)
      DO UPDATE SET
        ${updateSet},
        updated_at = now()
      RETURNING *
    )
    SELECT 1 FROM upsert_state
  `);
  } catch (err) {
    logger.error({ err }, 'updateNotificationSettings error');
  }
}

/** Reads notification settings for a channel user. */
export async function getNotificationSettings(
  db: DbPort,
  channelUserId: number,
): Promise<NotificationSettings | null> {
  try {
    const res = await runIntegratorSql<{
      notify_spb: boolean | null;
      notify_msk: boolean | null;
      notify_online: boolean | null;
      notify_bookings: boolean | null;
    }>(db, sql`
    SELECT ts.notify_spb, ts.notify_msk, ts.notify_online, ts.notify_bookings
    FROM identities i
    LEFT JOIN telegram_state ts
      ON ts.identity_id = i.id
    WHERE i.resource = 'telegram'
      AND i.external_id = ${String(channelUserId)}
    LIMIT 1
  `);

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
    try {
      const res = await runIntegratorSql<{ channel_id: string; username: string | null }>(db, sql`
      SELECT i.external_id::text AS channel_id, ts.username
      FROM contacts c
      JOIN identities i ON i.user_id = c.user_id AND i.resource = 'telegram'
      LEFT JOIN telegram_state ts ON ts.identity_id = i.id
      WHERE c.type = 'phone' AND c.value_normalized = ${phoneNormalized}
      LIMIT 1
    `);
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

  try {
    const res = await runIntegratorSql<{ channel_id: string }>(db, sql`
    SELECT i.external_id::text AS channel_id
    FROM contacts c
    JOIN identities i ON i.user_id = c.user_id AND i.resource = ${resource}
    WHERE c.type = 'phone' AND c.value_normalized = ${phoneNormalized}
    LIMIT 1
  `);
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
 * Phone for linkedPhone / orchestrator: normalized phone from platform_users (via user_channel_bindings
 * and merged_into_id chain), optionally combined with legacy messenger-labeled contacts rows, per admin
 * integrator_linked_phone_source (public_only | public_then_contacts | contacts_only).
 *
 * **SQL failure:** rethrows after logging (does not return `null` — `null` means no matching identity row).
 */
export async function getLinkDataByIdentity(
  db: DbPort,
  resource: string,
  externalId: string,
): Promise<ChannelUserLinkRow | null> {
  const strategy = await getIntegratorLinkedPhoneSource(db);

  if (resource === 'telegram') {
    try {
      const res = await runIntegratorSql<{
        user_id: string;
        channel_id: string;
        username: string | null;
        user_state: string | null;
        pub_phone: string | null;
        legacy_contact_phone: string | null;
      }>(db, sql`
      SELECT i.user_id::text AS user_id, i.external_id::text AS channel_id, ts.username, ts.state AS user_state,
             NULLIF(TRIM(pub.phone_normalized), '') AS pub_phone,
             cp.phone AS legacy_contact_phone
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
        WHERE c.user_id = i.user_id AND c.type = 'phone' AND c.label = ${resource}
        ORDER BY c.is_primary DESC NULLS LAST, c.id ASC
        LIMIT 1
      ) cp ON true
      WHERE i.resource = ${resource} AND i.external_id = ${externalId}
      LIMIT 1
    `);
      const row = res.rows[0];
      if (!row) return null;
      const pub = row.pub_phone;
      const leg = row.legacy_contact_phone;
      const phone = resolveLinkedPhoneNormalized(strategy, pub, leg);
      if (strategy === 'public_then_contacts' && !pub?.trim() && leg?.trim()) {
        logger.info(
          { event: 'linked_phone_legacy_fallback', resource, externalId, strategy },
          'linkedPhone: empty public.phone_normalized, using integrator.contacts (label=resource)',
        );
      }
      if (strategy === 'public_then_contacts' && pub?.trim() && leg?.trim() && pub.trim() !== leg.trim()) {
        logger.info(
          { event: 'linked_phone_drift_mismatch', resource, externalId, strategy },
          'linkedPhone: public.platform_users and integrator.contacts disagree; COALESCE prefers public',
        );
      }
      if (strategy === 'public_only' && !pub?.trim() && leg?.trim()) {
        logger.info(
          { event: 'linked_phone_drift_suppressed', resource, externalId, strategy },
          'linkedPhone: legacy contact exists but public_only ignores it',
        );
      }
      const chatId = Number(row.channel_id);
      // Like the Max branch below: never drop the row when external_id does not parse as a finite
      // number — userId/phoneNormalized are still valid (projection, linkedPhone, admin-facing reads).
      return {
        userId: row.user_id,
        chatId: Number.isFinite(chatId) ? chatId : 0,
        channelId: row.channel_id,
        username: row.username,
        phoneNormalized: phone,
        userState: row.user_state,
      };
    } catch (err) {
      logger.error(
        { err, resource, externalId, branch: 'telegram' },
        'getLinkDataByIdentity telegram error',
      );
      throw err;
    }
  }

  try {
    const res = await runIntegratorSql<{
      user_id: string;
      channel_id: string;
      pub_phone: string | null;
      legacy_contact_phone: string | null;
    }>(db, sql`
    SELECT i.user_id::text AS user_id, i.external_id::text AS channel_id,
           NULLIF(TRIM(pub.phone_normalized), '') AS pub_phone,
           cp.phone AS legacy_contact_phone
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
      WHERE c.user_id = i.user_id AND c.type = 'phone' AND c.label = ${resource}
      ORDER BY c.is_primary DESC NULLS LAST, c.id ASC
      LIMIT 1
    ) cp ON true
    WHERE i.resource = ${resource} AND i.external_id = ${externalId}
    LIMIT 1
  `);
    const row = res.rows[0];
    if (!row) return null;
    const pub = row.pub_phone;
    const leg = row.legacy_contact_phone;
    const phone = resolveLinkedPhoneNormalized(strategy, pub, leg);
    if (strategy === 'public_then_contacts' && !pub?.trim() && leg?.trim()) {
      logger.info(
        { event: 'linked_phone_legacy_fallback', resource, externalId, strategy },
        'linkedPhone: empty public.phone_normalized, using integrator.contacts (label=resource)',
      );
    }
    if (strategy === 'public_then_contacts' && pub?.trim() && leg?.trim() && pub.trim() !== leg.trim()) {
      logger.info(
        { event: 'linked_phone_drift_mismatch', resource, externalId, strategy },
        'linkedPhone: public.platform_users and integrator.contacts disagree; COALESCE prefers public',
      );
    }
    if (strategy === 'public_only' && !pub?.trim() && leg?.trim()) {
      logger.info(
        { event: 'linked_phone_drift_suppressed', resource, externalId, strategy },
        'linkedPhone: legacy contact exists but public_only ignores it',
      );
    }
    const chatId = Number(row.channel_id);
    return {
      userId: row.user_id,
      chatId: Number.isFinite(chatId) ? chatId : 0,
      channelId: row.channel_id,
      username: null,
      phoneNormalized: phone,
      userState: null,
    };
  } catch (err) {
    logger.error({ err, resource, externalId, branch: 'non_telegram' }, 'getLinkDataByIdentity error');
    throw err;
  }
}

/** Returns all channel identities for a given userId (telegram + max). */
export async function getChannelIdsByUserId(
  db: DbPort,
  userId: string,
): Promise<Array<{ resource: string; externalId: string; chatId: number }>> {
  try {
    const res = await runIntegratorSql<{ resource: string; external_id: string }>(db, sql`
    SELECT i.resource, i.external_id::text AS external_id
    FROM identities i
    WHERE i.user_id = ${userId} AND i.resource IN ('telegram', 'max')
    ORDER BY i.resource ASC
  `);
    return res.rows.map((row) => {
      const chatId = Number(row.external_id);
      return {
        resource: row.resource,
        externalId: row.external_id,
        chatId: Number.isFinite(chatId) ? chatId : 0,
      };
    }).filter((row) => row.chatId > 0);
  } catch (err) {
    logger.warn({ err, userId }, 'getChannelIdsByUserId: query failed');
    return [];
  }
}

/** Returns identity id by (resource, external_id) for use when drafting needs it. */
export async function getIdentityIdByResourceAndExternalId(
  db: DbPort,
  resource: string,
  externalId: string,
): Promise<string | null> {
  const res = await runIntegratorSql<{ id: string }>(
    db,
    sql`SELECT i.id::text AS id FROM identities i WHERE i.resource = ${resource} AND i.external_id = ${externalId} LIMIT 1`,
  );
  const row = res.rows[0];
  return row?.id ?? null;
}

/**
 * Links phone to a channel user via integrator `contacts` (messenger-labeled row). Canonical
 * patient phone for webapp remains `public.platform_users`; keep purge + `integrator_linked_phone_source`
 * aligned to avoid ghost `linkedPhone` from orphaned contacts.
 * Safe against takeover: if the phone is already linked to another user, the update is not applied
 * (idempotent re-link only for the same user).
 */
export async function setUserPhone(
  db: DbPort,
  channelUserId: string,
  phoneNormalized: string,
  resource: string = "telegram",
): Promise<SetUserPhoneOutcome> {
  const idRes = await runIntegratorSql<{ user_id: string }>(
    db,
    sql`
    SELECT i.user_id::text AS user_id
    FROM identities i
    WHERE i.resource = ${resource}
      AND i.external_id = ${channelUserId}
    LIMIT 1
  `,
  );
  const rawUserId = idRes.rows[0]?.user_id;
  if (!rawUserId) return 'failed';

  const userId = await resolveCanonicalIntegratorUserId(db, rawUserId);

  await runIntegratorSql(
    db,
    sql`
    DELETE FROM contacts
     WHERE type = 'phone'
       AND value_normalized = ${phoneNormalized}
       AND user_id <> ${userId}::bigint
  `,
  );

  try {
    const res = await runIntegratorSql(
      db,
      sql`
    INSERT INTO contacts (user_id, type, value_normalized, label, is_primary, created_at, updated_at)
    VALUES (${userId}::bigint, 'phone', ${phoneNormalized}, ${resource}, NULL, now(), now())
    ON CONFLICT (type, value_normalized)
    DO UPDATE SET
      user_id = EXCLUDED.user_id,
      label = EXCLUDED.label,
      updated_at = now()
    WHERE contacts.user_id = ${userId}::bigint
  `,
    );
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
