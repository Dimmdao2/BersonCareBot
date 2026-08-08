import type { PoolClient } from 'pg';
import { sql } from 'drizzle-orm';
import { syncUserContactsMirror, type MergeSqlExecutor } from '@bersoncare/platform-merge';
import {
  getWebappSqlFromPgClient,
  runWebappSql,
  type WebappSqlExecutor,
} from '@/infra/db/runWebappSql';
import { platformUsers, userContacts } from '../../../db/schema/schema';

/** Lateral join for primary phone on `platform_users` aliased as `pu`. */
export const USER_CONTACTS_PRIMARY_PHONE_LATERAL = `LEFT JOIN LATERAL (
  SELECT uc.value_normalized
  FROM user_contacts uc
  WHERE uc.platform_user_id = pu.id
    AND uc.contact_kind = 'phone'
    AND uc.is_primary = true
  LIMIT 1
) uc_pri_phone ON true`;

/** Lateral join for primary email on `platform_users` aliased as `pu`. */
export const USER_CONTACTS_PRIMARY_EMAIL_LATERAL = `LEFT JOIN LATERAL (
  SELECT uc.value_normalized
  FROM user_contacts uc
  WHERE uc.platform_user_id = pu.id
    AND uc.contact_kind = 'email'
    AND uc.is_primary = true
  LIMIT 1
) uc_pri_email ON true`;

/** Both primary phone and email laterals; requires `platform_users` aliased as `pu`. */
export const USER_CONTACTS_PRIMARY_LATERALS = `${USER_CONTACTS_PRIMARY_PHONE_LATERAL}
     ${USER_CONTACTS_PRIMARY_EMAIL_LATERAL}`;

/**
 * Primary contact columns. `user_contacts` is the source of truth (D15b/6): it holds the uniqueness
 * ("one phone = one account", migration 0380) and, unlike the scalar columns it replaced, it can
 * hold the several confirmed phones and e-mails one person is allowed to have
 * (`IDENTITY_AND_MERGE_SCHEME.md` §2). No fallback to the legacy columns: canonical coverage is
 * total and merge tombstones carry no contacts on either side. Requires
 * {@link USER_CONTACTS_PRIMARY_LATERAL}s.
 */
export const CONTACTS = {
  phoneNormalized: 'uc_pri_phone.value_normalized',
  emailNormalized: 'uc_pri_email.value_normalized',
} as const;

/** Non-empty primary phone (requires phone lateral). */
export const CONTACTS_HAS_PHONE = `(${CONTACTS.phoneNormalized} IS NOT NULL AND btrim(${CONTACTS.phoneNormalized}) <> '')`;

/** Missing/blank primary phone (requires phone lateral). */
export const CONTACTS_NO_PHONE = `(${CONTACTS.phoneNormalized} IS NULL OR btrim(${CONTACTS.phoneNormalized}) = '')`;

/** Primary phone for an arbitrary `platform_users` alias (no lateral join required). */
export function primaryPhoneSubqueryFor(puAlias: string): string {
  return `(SELECT uc.value_normalized FROM user_contacts uc WHERE uc.platform_user_id = ${puAlias}.id AND uc.contact_kind = 'phone' AND uc.is_primary = true LIMIT 1)`;
}

function resolveWebappSqlExecutor(executor: WebappSqlExecutor | PoolClient): WebappSqlExecutor {
  if ('release' in executor && typeof (executor as PoolClient).release === 'function') {
    return getWebappSqlFromPgClient(executor as PoolClient);
  }
  return executor as WebappSqlExecutor;
}

function webappMergeSqlExecutor(db: WebappSqlExecutor): MergeSqlExecutor {
  return {
    executeSql: (fragment) => runWebappSql(db, fragment),
  };
}

/** Rebuild `user_contacts` from four sources after a contact write (D15b/6 dual-write). */
export async function syncUserContactsMirrorWebapp(
  executor: WebappSqlExecutor | PoolClient,
  platformUserId: string,
): Promise<void> {
  const db = resolveWebappSqlExecutor(executor);
  await syncUserContactsMirror(webappMergeSqlExecutor(db), platformUserId);
}

/** Drizzle primary phone for the user (reads `user_contacts` only). */
export const drizzlePrimaryPhoneCol = sql<string | null>`(
  SELECT ${userContacts.valueNormalized} FROM ${userContacts}
   WHERE ${userContacts.platformUserId} = ${platformUsers.id}
     AND ${userContacts.contactKind} = 'phone'
     AND ${userContacts.isPrimary} = true
   LIMIT 1
)`;

export const drizzlePrimaryEmailCol = sql<string | null>`(
  SELECT ${userContacts.valueNormalized} FROM ${userContacts}
   WHERE ${userContacts.platformUserId} = ${platformUsers.id}
     AND ${userContacts.contactKind} = 'email'
     AND ${userContacts.isPrimary} = true
   LIMIT 1
)`;
