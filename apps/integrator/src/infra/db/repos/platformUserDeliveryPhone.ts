import { and, eq, isNotNull, isNull, or, sql } from 'drizzle-orm';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { getIntegratorDrizzleSession } from '../drizzle.js';
import { platformUsers } from '../schema/integratorPublicProduct.js';

/**
 * Resolves `phone_normalized` for integrator delivery-targets lookup.
 * `userKey` is either `platform_users.id` (uuid text) or `integrator_user_id` (numeric text).
 */
export async function getPhoneNormalizedForDeliveryLookup(
  db: DbPort,
  userKey: string,
): Promise<string | null> {
  const trimmed = userKey.trim();
  if (!trimmed) return null;
  const d = getIntegratorDrizzleSession(db);
  const rows = await d
    .select({ phoneNormalized: platformUsers.phoneNormalized })
    .from(platformUsers)
    .where(
      and(
        isNull(platformUsers.mergedIntoId),
        isNotNull(platformUsers.phoneNormalized),
        sql`trim(${platformUsers.phoneNormalized}) <> ''`,
        or(
          eq(sql`${platformUsers.id}::text`, trimmed),
          eq(sql`${platformUsers.integratorUserId}::text`, trimmed),
        ),
      ),
    )
    .limit(1);
  const raw = rows[0]?.phoneNormalized;
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null;
}
