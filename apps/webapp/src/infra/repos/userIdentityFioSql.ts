import type { PoolClient } from 'pg';
import { eq, sql } from 'drizzle-orm';
import { syncUserIdentityFioMirror } from '@bersoncare/platform-merge';
import {
  getWebappSqlFromPgClient,
  runWebappSql,
  type WebappSqlExecutor,
} from '@/infra/db/runWebappSql';
import { platformUsers, userIdentity } from '../../../db/schema/schema';

/** Requires `platform_users` aliased as `pu`. */
export const USER_IDENTITY_FIO_JOIN = 'LEFT JOIN user_identity ui ON ui.platform_user_id = pu.id';

/** COALESCE expressions; requires {@link USER_IDENTITY_FIO_JOIN}. */
export const FIO = {
  firstName: 'COALESCE(ui.first_name, pu.first_name)',
  lastName: 'COALESCE(ui.last_name, pu.last_name)',
  patronymic: 'COALESCE(ui.patronymic, pu.patronymic)',
  displayName: 'COALESCE(ui.display_name, pu.display_name)',
  birthDate: 'COALESCE(ui.birth_date, pu.birth_date)',
} as const;

/** Five FIO columns with legacy column aliases for drop-in SELECT lists. */
export const FIO_SELECT =
  `${FIO.displayName} AS display_name, ${FIO.firstName} AS first_name, ${FIO.lastName} AS last_name, ${FIO.patronymic} AS patronymic, ${FIO.birthDate} AS birth_date`;

function resolveWebappSqlExecutor(executor: WebappSqlExecutor | PoolClient): WebappSqlExecutor {
  if ('release' in executor && typeof (executor as PoolClient).release === 'function') {
    return getWebappSqlFromPgClient(executor as PoolClient);
  }
  return executor as WebappSqlExecutor;
}

/** Mirror FIO from `platform_users` into `user_identity` after a write (D15b/5 dual-write). */
export async function syncUserIdentityFioMirrorWebapp(
  executor: WebappSqlExecutor | PoolClient,
  platformUserId: string,
): Promise<void> {
  const db = resolveWebappSqlExecutor(executor);
  await syncUserIdentityFioMirror({
    executeSql: (fragment) => runWebappSql(db, fragment),
  }, platformUserId);
}

/** Drizzle LEFT JOIN target: `userIdentity.platformUserId = platformUsers.id`. */
export const drizzleUserIdentityFioJoin = eq(userIdentity.platformUserId, platformUsers.id);

/** COALESCE FIO columns for Drizzle selects that already join {@link userIdentity}. */
export const drizzleFioCols = {
  displayName: sql<string>`COALESCE(${userIdentity.displayName}, ${platformUsers.displayName})`,
  firstName: sql<string | null>`COALESCE(${userIdentity.firstName}, ${platformUsers.firstName})`,
  lastName: sql<string | null>`COALESCE(${userIdentity.lastName}, ${platformUsers.lastName})`,
  patronymic: sql<string | null>`COALESCE(${userIdentity.patronymic}, ${platformUsers.patronymic})`,
  birthDate: sql<string | null>`COALESCE(${userIdentity.birthDate}, ${platformUsers.birthDate})`,
};
