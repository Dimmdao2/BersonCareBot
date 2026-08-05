import { runWebappPgText, type WebappSqlExecutor } from '@/infra/db/runWebappSql';
import { FIO, USER_IDENTITY_FIO_JOIN } from '@/infra/repos/userIdentityFioSql';
import {
  CONTACTS,
  USER_CONTACTS_PRIMARY_PHONE_LATERAL,
} from '@/infra/repos/userContactsSql';

/** Max hops when following merged_into_id (cycle protection). */
export const MAX_MERGE_CHAIN_DEPTH = 5;

/**
 * Follow merged_into_id chain to the canonical platform user id.
 * Returns `startId` if the row has no merge redirect or chain is broken.
 */
export async function followMergedIntoChain(
  db: WebappSqlExecutor,
  startId: string,
): Promise<string> {
  let current = startId;
  const seen = new Set<string>();
  for (let depth = 0; depth < MAX_MERGE_CHAIN_DEPTH; depth++) {
    if (seen.has(current)) {
      console.warn('[canonical] merged_into_id cycle detected at', current);
      return startId;
    }
    seen.add(current);
    const r = await runWebappPgText<{ merged_into_id: string | null }>(
      `SELECT merged_into_id FROM platform_users WHERE id = $1`,
      [current],
      db,
    );
    const next = r.rows[0]?.merged_into_id ?? null;
    if (next == null) return current;
    current = next;
  }
  console.warn('[canonical] merged_into_id chain exceeded max depth from', startId);
  return current;
}

export type PlatformUserRow = {
  id: string;
  phone_normalized: string | null;
  integrator_user_id: string | null;
  merged_into_id: string | null;
  display_name: string;
  role: string;
};

export async function selectPlatformUserById(
  db: WebappSqlExecutor,
  userId: string,
): Promise<PlatformUserRow | null> {
  const r = await runWebappPgText<PlatformUserRow>(
    `SELECT pu.id, ${CONTACTS.phoneNormalized} AS phone_normalized,
            pu.integrator_user_id::text AS integrator_user_id, pu.merged_into_id,
            ${FIO.displayName} AS display_name, pu.role
     FROM platform_users pu
     ${USER_IDENTITY_FIO_JOIN}
     ${USER_CONTACTS_PRIMARY_PHONE_LATERAL}
     WHERE pu.id = $1`,
    [userId],
    db,
  );
  return r.rows[0] ?? null;
}

/** Resolve to canonical id; returns null if user row missing. */
export async function resolveCanonicalUserId(
  db: WebappSqlExecutor,
  userId: string,
): Promise<string | null> {
  const row = await selectPlatformUserById(db, userId);
  if (!row) return null;
  if (!row.merged_into_id) return row.id;
  return followMergedIntoChain(db, row.merged_into_id);
}

/** Exactly one canonical row per phone; returns null if none; throws if multiple (data anomaly). */
export async function findCanonicalUserIdByPhone(
  db: WebappSqlExecutor,
  phoneNormalized: string,
): Promise<string | null> {
  const r = await runWebappPgText<{ id: string }>(
    `SELECT uc.platform_user_id AS id
     FROM user_contacts uc
     INNER JOIN platform_users pu ON pu.id = uc.platform_user_id
     WHERE uc.contact_kind = 'phone'
       AND uc.value_normalized = $1
       AND pu.merged_into_id IS NULL
     ORDER BY pu.created_at ASC
     LIMIT 3`,
    [phoneNormalized],
    db,
  );
  if (r.rows.length > 0) {
    if (r.rows.length > 1) {
      console.error('[canonical] multiple canonical rows for phone via user_contacts (redacted)', {
        count: r.rows.length,
        ids: r.rows.map((x) => x.id),
      });
      return null;
    }
    return r.rows[0]!.id;
  }
  const legacy = await runWebappPgText<{ id: string }>(
    `SELECT id FROM platform_users
     WHERE phone_normalized = $1 AND merged_into_id IS NULL
     ORDER BY created_at ASC
     LIMIT 3`,
    [phoneNormalized],
    db,
  );
  if (legacy.rows.length === 0) return null;
  if (legacy.rows.length > 1) {
    console.error('[canonical] multiple canonical rows for phone (redacted)', {
      count: legacy.rows.length,
      ids: legacy.rows.map((x) => x.id),
    });
    return null;
  }
  return legacy.rows[0]!.id;
}

/** Exactly one canonical row per integrator id. */
export async function findCanonicalUserIdByIntegratorId(
  db: WebappSqlExecutor,
  integratorUserId: string,
): Promise<string | null> {
  const r = await runWebappPgText<{ id: string }>(
    `SELECT id FROM platform_users
     WHERE integrator_user_id = $1::bigint AND merged_into_id IS NULL
     ORDER BY created_at ASC
     LIMIT 3`,
    [integratorUserId],
    db,
  );
  if (r.rows.length === 0) return null;
  if (r.rows.length > 1) {
    console.error('[canonical] multiple canonical rows for integrator_user_id', {
      integratorUserId,
      ids: r.rows.map((x) => x.id),
    });
    return null;
  }
  return r.rows[0].id;
}

/**
 * Canonical user with this phone **and** trusted patient activation (`patient_phone_trust_at`).
 * Used for messenger entry resolution: do not link a channel to a canon by phone unless activation is trusted (§5).
 */
export async function findTrustedCanonicalUserIdByPhone(
  db: WebappSqlExecutor,
  phoneNormalized: string,
): Promise<string | null> {
  const r = await runWebappPgText<{ id: string }>(
    `SELECT id FROM platform_users
     WHERE phone_normalized = $1 AND merged_into_id IS NULL
       AND patient_phone_trust_at IS NOT NULL
     ORDER BY created_at ASC
     LIMIT 3`,
    [phoneNormalized],
    db,
  );
  if (r.rows.length === 0) return null;
  if (r.rows.length > 1) {
    console.error('[canonical] multiple trusted canonical rows for phone (redacted)', {
      count: r.rows.length,
    });
    return null;
  }
  return r.rows[0]!.id;
}

export async function findCanonicalUserIdByChannelBinding(
  db: WebappSqlExecutor,
  channelCode: string,
  externalId: string,
): Promise<string | null> {
  const r = await runWebappPgText<{ user_id: string }>(
    `SELECT uc.platform_user_id AS user_id
     FROM user_contacts uc
     INNER JOIN platform_users pu ON pu.id = uc.platform_user_id
     WHERE uc.contact_kind = 'channel'
       AND uc.channel_code = $1
       AND uc.value_normalized = $2
       AND pu.merged_into_id IS NULL
     LIMIT 1`,
    [channelCode, externalId],
    db,
  );
  if (r.rows[0]?.user_id) return r.rows[0].user_id;
  const legacy = await runWebappPgText<{ user_id: string }>(
    `SELECT ucb.user_id
     FROM user_channel_bindings ucb
     INNER JOIN platform_users pu ON pu.id = ucb.user_id
     WHERE ucb.channel_code = $1 AND ucb.external_id = $2
       AND pu.merged_into_id IS NULL
     LIMIT 1`,
    [channelCode, externalId],
    db,
  );
  return legacy.rows[0]?.user_id ?? null;
}

export type CandidateIds = {
  byIntegrator: string | null;
  byPhone: string | null;
  byChannel: string | null;
};

/** Collect distinct canonical candidate ids from lookups (non-null only). */
export function distinctCanonicalCandidates(c: CandidateIds): string[] {
  const set = new Set<string>();
  if (c.byIntegrator) set.add(c.byIntegrator);
  if (c.byPhone) set.add(c.byPhone);
  if (c.byChannel) set.add(c.byChannel);
  return [...set];
}
