import { sql } from 'drizzle-orm';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { runIntegratorSql } from '../runIntegratorSql.js';

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
    const r = await runIntegratorSql<{ id: string }>(
      db,
      sql`SELECT id FROM public.platform_users
          WHERE phone_normalized = ${phoneNormalized} AND merged_into_id IS NULL
          ORDER BY created_at ASC
          LIMIT 3`,
    );
    if (r.rows.length === 1) {
      return r.rows[0]!.id;
    }
  }
  if (integratorUserId) {
    const r2 = await runIntegratorSql<{ id: string }>(
      db,
      sql`SELECT id FROM public.platform_users
          WHERE integrator_user_id = ${integratorUserId}::bigint AND merged_into_id IS NULL
          ORDER BY created_at ASC
          LIMIT 3`,
    );
    if (r2.rows.length === 1) {
      return r2.rows[0]!.id;
    }
  }
  return null;
}
