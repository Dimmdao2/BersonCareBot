import { and, eq, isNotNull, isNull, or, sql } from 'drizzle-orm';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { getIntegratorDrizzleSession } from '../drizzle.js';
import { platformUsers } from '../schema/integratorPublicProduct.js';
import { resolveCanonicalPlatformUserIdFromId } from './platformUserByChannel.js';

export type CanonicalPlatformUserDeliveryIdentity = {
  phoneNormalized: string | null;
  integratorUserId: string | null;
};

/** Canonical delivery identity for a platform user; DB failures are intentionally observable. */
export async function getCanonicalPlatformUserDeliveryIdentity(
  db: DbPort,
  platformUserId: string,
): Promise<CanonicalPlatformUserDeliveryIdentity | null> {
  const canonicalId = await resolveCanonicalPlatformUserIdFromId(db, platformUserId);
  const rows = await getIntegratorDrizzleSession(db)
    .select({
      phoneNormalized: platformUsers.phoneNormalized,
      integratorUserId: platformUsers.integratorUserId,
    })
    .from(platformUsers)
    .where(eq(platformUsers.id, canonicalId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    phoneNormalized: row.phoneNormalized?.trim() || null,
    integratorUserId: row.integratorUserId == null ? null : String(row.integratorUserId),
  };
}

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
