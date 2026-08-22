import { sql } from 'drizzle-orm';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { runIntegratorNamedRoot } from '../runIntegratorSql.js';

/**
 * D17 финал. Оба чтения шли реляционно по `public.platform_users` + `public.user_contacts` под
 * ролью вебаппа. Ключ у них разный по форме (uuid канонического человека либо числовой
 * `integrator_user_id`), а читаемое — одно и то же, поэтому корень ОДИН и принимает обе формы.
 */

const DELIVERY_IDENTITY_ROOT = 'app.integrator_read_platform_user_delivery_identity(text)';

export type CanonicalPlatformUserDeliveryIdentity = {
  phoneNormalized: string | null;
  integratorUserId: string | null;
};

async function readDeliveryIdentity(
  db: DbPort,
  userKey: string,
): Promise<CanonicalPlatformUserDeliveryIdentity | null> {
  const res = await runIntegratorNamedRoot<{
    phone_normalized: string | null;
    integrator_user_id: string | null;
  }>(
    db,
    DELIVERY_IDENTITY_ROOT,
    [userKey],
    sql`SELECT phone_normalized, integrator_user_id
        FROM app.integrator_read_platform_user_delivery_identity(${userKey}::text)`,
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    phoneNormalized: row.phone_normalized?.trim() || null,
    integratorUserId:
      row.integrator_user_id == null ? null : String(row.integrator_user_id),
  };
}

/** Canonical delivery identity for a platform user; DB failures are intentionally observable. */
export async function getCanonicalPlatformUserDeliveryIdentity(
  db: DbPort,
  platformUserId: string,
): Promise<CanonicalPlatformUserDeliveryIdentity | null> {
  return readDeliveryIdentity(db, platformUserId);
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
  const identity = await readDeliveryIdentity(db, trimmed);
  return identity?.phoneNormalized ?? null;
}
