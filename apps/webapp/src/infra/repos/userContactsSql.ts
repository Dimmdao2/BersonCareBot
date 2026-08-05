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

/** COALESCE primary contact columns; requires {@link USER_CONTACTS_PRIMARY_LATERAL}s. */
export const CONTACTS = {
  phoneNormalized: 'COALESCE(uc_pri_phone.value_normalized, pu.phone_normalized)',
  emailNormalized: 'COALESCE(uc_pri_email.value_normalized, pu.email_normalized)',
} as const;

/** Non-empty primary phone (requires phone lateral). */
export const CONTACTS_HAS_PHONE = `(${CONTACTS.phoneNormalized} IS NOT NULL AND btrim(${CONTACTS.phoneNormalized}) <> '')`;

/** Missing/blank primary phone (requires phone lateral). */
export const CONTACTS_NO_PHONE = `(${CONTACTS.phoneNormalized} IS NULL OR btrim(${CONTACTS.phoneNormalized}) = '')`;

/** Primary phone COALESCE for arbitrary `platform_users` alias (no lateral join required). */
export function primaryPhoneCoalesceFor(puAlias: string): string {
  return `COALESCE((SELECT uc.value_normalized FROM user_contacts uc WHERE uc.platform_user_id = ${puAlias}.id AND uc.contact_kind = 'phone' AND uc.is_primary = true LIMIT 1), ${puAlias}.phone_normalized)`;
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

/** Drizzle COALESCE for primary phone when `userContacts` is joined for the user. */
export const drizzlePrimaryPhoneCol = sql<string | null>`COALESCE(
  (SELECT ${userContacts.valueNormalized} FROM ${userContacts}
   WHERE ${userContacts.platformUserId} = ${platformUsers.id}
     AND ${userContacts.contactKind} = 'phone'
     AND ${userContacts.isPrimary} = true
   LIMIT 1),
  ${platformUsers.phoneNormalized}
)`;

export const drizzlePrimaryEmailCol = sql<string | null>`COALESCE(
  (SELECT ${userContacts.valueNormalized} FROM ${userContacts}
   WHERE ${userContacts.platformUserId} = ${platformUsers.id}
     AND ${userContacts.contactKind} = 'email'
     AND ${userContacts.isPrimary} = true
   LIMIT 1),
  ${platformUsers.emailNormalized}
)`;
