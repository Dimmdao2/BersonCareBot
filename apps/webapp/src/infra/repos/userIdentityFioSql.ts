import type { PoolClient } from 'pg';
import { eq, sql } from 'drizzle-orm';
import { syncUserIdentityFioMirror, type MergeSqlExecutor } from '@bersoncare/platform-merge';
import {
  getWebappSqlFromPgClient,
  runWebappSql,
  type WebappSqlExecutor,
} from '@/infra/db/runWebappSql';
import { platformUsers, userIdentity } from '../../../db/schema/schema';

/** Requires `platform_users` aliased as `pu`. */
export const USER_IDENTITY_FIO_JOIN = 'LEFT JOIN user_identity ui ON ui.platform_user_id = pu.id';

/**
 * FIO read expressions. `user_identity` is the source of truth (D15b/5, migration 0381 made the
 * mirror total — one row per `platform_users` row, merge tombstones included), so there is no
 * fallback to the legacy columns: a missing mirror row is a defect that must surface as NULL, not
 * be hidden behind a COALESCE. Requires {@link USER_IDENTITY_FIO_JOIN}.
 */
export const FIO = {
  firstName: 'ui.first_name',
  lastName: 'ui.last_name',
  patronymic: 'ui.patronymic',
  displayName: 'ui.display_name',
  birthDate: 'ui.birth_date',
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

function webappMergeSqlExecutor(db: WebappSqlExecutor): MergeSqlExecutor {
  return {
    executeSql: (fragment) => runWebappSql(db, fragment),
  };
}

/** Mirror FIO from `platform_users` into `user_identity` after a write (D15b/5 dual-write). */
export async function syncUserIdentityFioMirrorWebapp(
  executor: WebappSqlExecutor | PoolClient,
  platformUserId: string,
): Promise<void> {
  const db = resolveWebappSqlExecutor(executor);
  await syncUserIdentityFioMirror(webappMergeSqlExecutor(db), platformUserId);
}

/** Drizzle LEFT JOIN target: `userIdentity.platformUserId = platformUsers.id`. */
export const drizzleUserIdentityFioJoin = eq(userIdentity.platformUserId, platformUsers.id);

/** FIO columns for Drizzle selects that already join {@link userIdentity} (no legacy fallback). */
export const drizzleFioCols = {
  displayName: sql<string>`${userIdentity.displayName}`,
  firstName: sql<string | null>`${userIdentity.firstName}`,
  lastName: sql<string | null>`${userIdentity.lastName}`,
  patronymic: sql<string | null>`${userIdentity.patronymic}`,
  birthDate: sql<string | null>`${userIdentity.birthDate}`,
};
