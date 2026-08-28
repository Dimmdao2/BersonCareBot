import { sql } from 'drizzle-orm';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { runIntegratorNamedRoot } from '../runIntegratorSql.js';

/**
 * D17 финал. Оба чтения шли реляционно по `public.platform_users` + `public.user_contacts` под
 * ролью вебаппа. Читаемое у них одно и то же, поэтому корень ОДИН.
 *
 * Track D (#987): корень пересоздан. Он возвращает ровно `phone_normalized`, ключ принимает только
 * канонический uuid (не-uuid отвергается без чтения), а каждое чтение `platform_users` внутри несёт
 * предикат арендатора. Вытесненной публичной личности нет ни во входе, ни в выходе.
 */

const DELIVERY_IDENTITY_ROOT = 'app.integrator_read_platform_user_delivery_identity(text)';

export type CanonicalPlatformUserDeliveryIdentity = {
  phoneNormalized: string | null;
};

async function readDeliveryIdentity(
  db: DbPort,
  userKey: string,
): Promise<CanonicalPlatformUserDeliveryIdentity | null> {
  const res = await runIntegratorNamedRoot<{
    phone_normalized: string | null;
  }>(
    db,
    DELIVERY_IDENTITY_ROOT,
    [userKey],
    sql`SELECT phone_normalized
        FROM app.integrator_read_platform_user_delivery_identity(${userKey}::text)`,
  );
  const row = res.rows[0];
  if (!row) return null;
  return { phoneNormalized: row.phone_normalized?.trim() || null };
}

/** Canonical delivery identity for a platform user; DB failures are intentionally observable. */
export async function getCanonicalPlatformUserDeliveryIdentity(
  db: DbPort,
  platformUserId: string,
): Promise<CanonicalPlatformUserDeliveryIdentity | null> {
  return readDeliveryIdentity(db, platformUserId);
}

/**
 * Resolves `phone_normalized` for integrator delivery-targets lookup. `userKey` is the canonical
 * `platform_users.id`; anything that is not a uuid returns null without reading a row.
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
