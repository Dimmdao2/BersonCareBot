import type { DbPort } from '../../../kernel/contracts/index.js';

/**
 * Resolves `phone_normalized` for integrator delivery-targets lookup.
 * `userKey` is either `platform_users.id` (uuid text) or `integrator_user_id` (numeric text).
 */
export async function getPhoneNormalizedForDeliveryLookup(db: DbPort, userKey: string): Promise<string | null> {
  const trimmed = userKey.trim();
  if (!trimmed) return null;
  const res = await db.query<{ phone_normalized: string | null }>(
    `SELECT phone_normalized
     FROM public.platform_users
     WHERE merged_into_id IS NULL
       AND phone_normalized IS NOT NULL
       AND trim(phone_normalized) <> ''
       AND (
         id::text = $1
         OR (integrator_user_id IS NOT NULL AND integrator_user_id::text = $1)
       )
     LIMIT 1`,
    [trimmed],
  );
  const raw = res.rows[0]?.phone_normalized;
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null;
}
