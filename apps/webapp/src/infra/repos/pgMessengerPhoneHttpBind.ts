import type { Pool } from 'pg';
import { z } from 'zod';
import type { MessengerPhoneBindDb } from '@bersoncare/platform-merge';
import {
  getWebappSqlDb,
  getWebappSqlFromPgClient,
  runWebappPgText,
  type WebappSqlExecutor,
} from '@/infra/db/runWebappSql';
import { startPoolTransaction } from '@/infra/db/withClient';
import { logger } from '@/infra/logging/logger';

export type MessengerPhoneBindTransaction = {
  /** Порт вебаппа: наши собственные запросы идут только через него. */
  db: WebappSqlExecutor;
  /** Тот же порт, обёрнутый под интерфейс пакета `platform-merge` (он транспортно-независим). */
  mergeDb: MessengerPhoneBindDb;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  release(): Promise<void>;
};

const MAX_MERGE_CHAIN_DEPTH = 32;
const BIGINT_STRING = /^\d+$/;

const mergedIntoRowSchema = z.object({
  merged_into_user_id: z.string().nullable(),
});

const integratorIdentityRowSchema = z.object({
  user_id: z.string(),
});

/**
 * Единственный переходник между портом вебаппа и `.query`-формой пакета `platform-merge`.
 * Пакет общий с интегратором и поэтому не может зависеть от drizzle-порта вебаппа; всё, что
 * выполняется, всё равно проходит через `runWebappPgText`.
 */
export function asMessengerPhoneBindDb(db: WebappSqlExecutor): MessengerPhoneBindDb {
  return {
    query: async (sql, values = []) => runWebappPgText(sql, values, db),
  };
}

export function poolAsMessengerPhoneBindDb(): MessengerPhoneBindDb {
  return asMessengerPhoneBindDb(getWebappSqlDb());
}

export async function startMessengerPhoneBindTransaction(
  pool: Pool,
): Promise<MessengerPhoneBindTransaction> {
  const tx = await startPoolTransaction(pool);
  const db = getWebappSqlFromPgClient(tx.client);
  return {
    db,
    mergeDb: asMessengerPhoneBindDb(db),
    commit: () => tx.commit(),
    rollback: () => tx.rollback(),
    release: () => tx.release(),
  };
}

export async function resolveCanonicalIntegratorUserId(
  db: WebappSqlExecutor,
  integratorUserId: string,
): Promise<string> {
  const trimmed = integratorUserId.trim();
  if (!trimmed || !BIGINT_STRING.test(trimmed)) return integratorUserId;

  let current = trimmed;
  const visited = new Set<string>();
  for (let depth = 0; depth < MAX_MERGE_CHAIN_DEPTH; depth++) {
    if (visited.has(current)) {
      logger.warn(
        { integratorUserId, current },
        'resolveCanonicalIntegratorUserId: cycle in merged_into_user_id chain',
      );
      return current;
    }
    visited.add(current);

    const res = await runWebappPgText(
      `SELECT merged_into_user_id::text AS merged_into_user_id
       FROM users
       WHERE id = $1::bigint
       LIMIT 1`,
      [current],
      db,
    );
    const parsed = mergedIntoRowSchema.safeParse(res.rows[0]);
    if (!parsed.success) {
      return current;
    }
    const row = parsed.data;
    if (row.merged_into_user_id == null || row.merged_into_user_id === '') {
      return current;
    }
    current = row.merged_into_user_id;
  }
  logger.warn(
    { integratorUserId, current },
    'resolveCanonicalIntegratorUserId: max chain depth exceeded',
  );
  return current;
}

export async function ensureIdentityForMessenger(
  db: WebappSqlExecutor,
  input: { resource: string; externalId: string },
): Promise<void> {
  if (input.resource !== 'max' || !input.externalId.trim()) return;
  const sql = `
    WITH existing AS (
      SELECT id FROM identities
      WHERE resource = $1 AND external_id = $2
      LIMIT 1
    ),
    new_user AS (
      INSERT INTO users (created_at, updated_at)
      SELECT now(), now()
      WHERE NOT EXISTS (SELECT 1 FROM existing)
      RETURNING id
    ),
    user_id AS (
      SELECT id FROM new_user
      UNION ALL
      SELECT i.user_id FROM identities i
      WHERE i.resource = $1 AND i.external_id = $2
      LIMIT 1
    ),
    ins AS (
      INSERT INTO identities (user_id, resource, external_id, created_at, updated_at)
      SELECT (SELECT id FROM user_id LIMIT 1), $1, $2, now(), now()
      WHERE NOT EXISTS (SELECT 1 FROM existing)
      ON CONFLICT (resource, external_id) DO UPDATE SET updated_at = now()
    )
    SELECT 1
  `;
  await runWebappPgText(sql, [input.resource, input.externalId.trim()], db);
}

export async function loadIntegratorIdentityUserId(
  db: WebappSqlExecutor,
  input: { resource: string; channelUserId: string },
): Promise<string | null> {
  const idPeek = await runWebappPgText(
    `SELECT i.user_id::text AS user_id
     FROM identities i
     WHERE i.resource = $2 AND i.external_id = $1
     LIMIT 1`,
    [input.channelUserId, input.resource],
    db,
  );
  const peekParsed = integratorIdentityRowSchema.safeParse(idPeek.rows[0]);
  return peekParsed.success ? peekParsed.data.user_id : null;
}

export type SetUserPhoneOutcome = 'applied' | 'noop_conflict' | 'failed';

export async function setUserPhone(
  db: WebappSqlExecutor,
  channelUserId: string,
  phoneNormalized: string,
  resource: string,
): Promise<SetUserPhoneOutcome> {
  const idRes = await runWebappPgText(
    `SELECT i.user_id::text AS user_id
     FROM identities i
     WHERE i.resource = $2
       AND i.external_id = $1
     LIMIT 1`,
    [channelUserId, resource],
    db,
  );
  const idParsed = integratorIdentityRowSchema.safeParse(idRes.rows[0]);
  if (!idParsed.success) return 'failed';

  const userId = await resolveCanonicalIntegratorUserId(db, idParsed.data.user_id);

  await runWebappPgText(
    `DELETE FROM contacts
     WHERE type = 'phone'
       AND value_normalized = $2
       AND user_id <> $1::bigint`,
    [userId, phoneNormalized],
    db,
  );

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
    const res = await runWebappPgText(query, [userId, phoneNormalized, resource], db);
    return (res.rowCount ?? 0) > 0 ? 'applied' : 'noop_conflict';
  } catch (err) {
    logger.error({ err }, 'setUserPhone error');
    return 'failed';
  }
}
