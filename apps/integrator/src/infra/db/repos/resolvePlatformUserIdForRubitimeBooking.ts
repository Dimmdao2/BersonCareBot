import type { DbPort } from '../../../kernel/contracts/index.js';

/**
 * Best-effort resolve `platform_users.id` for Rubitime booking projection (no merge — mirrors
 * lightweight lookups in webapp when full `ensureClient` is skipped).
 */
export async function resolvePlatformUserIdForRubitimeBooking(
  db: DbPort,
  phoneNormalized: string | null,
  integratorUserId: string | null,
): Promise<string | null> {
  if (phoneNormalized) {
    const r = await db.query<{ id: string }>(
      `SELECT id FROM public.platform_users
       WHERE phone_normalized = $1 AND merged_into_id IS NULL
       ORDER BY created_at ASC
       LIMIT 3`,
      [phoneNormalized],
    );
    if (r.rows.length === 1) {
      return r.rows[0]!.id;
    }
  }
  if (integratorUserId) {
    const r2 = await db.query<{ id: string }>(
      `SELECT id FROM public.platform_users
       WHERE integrator_user_id = $1::bigint AND merged_into_id IS NULL
       ORDER BY created_at ASC
       LIMIT 3`,
      [integratorUserId],
    );
    if (r2.rows.length === 1) {
      return r2.rows[0]!.id;
    }
  }
  return null;
}
