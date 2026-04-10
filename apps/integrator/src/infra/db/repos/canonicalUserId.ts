import type { DbPort } from '../../../kernel/contracts/index.js';
import { logger } from '../../observability/logger.js';

const MAX_MERGE_CHAIN_DEPTH = 32;

const BIGINT_STRING = /^\d+$/;

/**
 * Follows `users.merged_into_user_id` to the canonical (winner) row.
 * Non-numeric ids are returned unchanged (callers that use UUIDs etc.).
 * Missing `users` row: returns input (no merge metadata).
 */
export async function resolveCanonicalIntegratorUserId(db: DbPort, integratorUserId: string): Promise<string> {
  const trimmed = integratorUserId.trim();
  if (!trimmed || !BIGINT_STRING.test(trimmed)) return integratorUserId;

  let current = trimmed;
  const visited = new Set<string>();
  for (let depth = 0; depth < MAX_MERGE_CHAIN_DEPTH; depth++) {
    if (visited.has(current)) {
      logger.warn({ integratorUserId, current }, 'resolveCanonicalIntegratorUserId: cycle in merged_into_user_id chain');
      return current;
    }
    visited.add(current);

    const res = await db.query<{ merged_into_user_id: string | null }>(
      `SELECT merged_into_user_id::text AS merged_into_user_id
       FROM users
       WHERE id = $1::bigint
       LIMIT 1`,
      [current],
    );
    const row = res.rows[0];
    if (!row || row.merged_into_user_id == null || row.merged_into_user_id === '') {
      return current;
    }
    current = row.merged_into_user_id;
  }
  logger.warn({ integratorUserId, current }, 'resolveCanonicalIntegratorUserId: max chain depth exceeded');
  return current;
}

/**
 * Maps `identities.id` → canonical `users.id` string for projection payloads (`integratorUserId`).
 */
export async function resolveCanonicalUserIdFromIdentityId(db: DbPort, identityId: string): Promise<string> {
  const trimmed = identityId.trim();
  if (!trimmed || !BIGINT_STRING.test(trimmed)) return identityId;

  const res = await db.query<{ user_id: string | null }>(
    `SELECT user_id::text AS user_id
     FROM identities
     WHERE id = $1::bigint
     LIMIT 1`,
    [trimmed],
  );
  const uid = res.rows[0]?.user_id;
  if (!uid) return identityId;
  return resolveCanonicalIntegratorUserId(db, uid);
}

/** Top-level JSON keys that carry integrator `users.id` into webapp appointment projection. */
const APPOINTMENT_PAYLOAD_USER_ID_KEYS = ['integratorUserId', 'integrator_user_id'] as const;

/**
 * Replaces numeric integrator user id fields in a plain object (e.g. Rubitime `payloadJson` clone)
 * with canonical `users.id` strings. Unknown / non-numeric values are left unchanged.
 */
export async function canonicalizeIntegratorUserIdKeysInObject(
  db: DbPort,
  obj: Record<string, unknown>,
): Promise<void> {
  for (const key of APPOINTMENT_PAYLOAD_USER_ID_KEYS) {
    if (!(key in obj)) continue;
    const raw = obj[key];
    if (typeof raw === 'string' && BIGINT_STRING.test(raw.trim())) {
      obj[key] = await resolveCanonicalIntegratorUserId(db, raw.trim());
    } else if (typeof raw === 'number' && Number.isFinite(raw)) {
      obj[key] = await resolveCanonicalIntegratorUserId(db, String(Math.trunc(raw)));
    }
  }
}
