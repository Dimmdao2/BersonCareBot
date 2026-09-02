import type { SQL } from 'drizzle-orm';
import type { Pool, PoolClient, QueryResultRow } from 'pg';
import {
  getWebappSqlDb,
  getWebappSqlFromPgClient,
  runPgPoolSql,
  runWebappSql,
} from '@/infra/db/runWebappSql';

/** Domain SQL on default Drizzle pool (same `getPool()`). */
export async function runIdentityPoolSql<T = QueryResultRow>(fragment: SQL) {
  return runWebappSql<T>(getWebappSqlDb(), fragment);
}

/** Domain SQL on an injected pool (tests / explicit pool arg). */
export async function runIdentityPoolSqlOnPool<T extends QueryResultRow = QueryResultRow>(
  pool: Pick<Pool, 'query'>,
  fragment: SQL,
) {
  return runPgPoolSql<T>(pool, fragment);
}

/** Domain SQL inside a multipart TX on a dedicated `PoolClient`. */
export async function runIdentityClientSql<T = QueryResultRow>(client: PoolClient, fragment: SQL) {
  return runWebappSql<T>(getWebappSqlFromPgClient(client), fragment);
}
