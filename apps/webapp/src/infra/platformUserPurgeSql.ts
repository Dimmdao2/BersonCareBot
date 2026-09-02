import type { SQL } from 'drizzle-orm';
import type { Pool, PoolClient, QueryResultRow } from 'pg';
import { getWebappSqlFromPgClient, runPgPoolSql, runWebappSql } from '@/infra/db/runWebappSql';

/** Domain SQL on default webapp pool. */
export async function runPurgePoolSql<T extends QueryResultRow = QueryResultRow>(
  pool: Pick<Pool, 'query'>,
  fragment: SQL,
) {
  return runPgPoolSql<T>(pool, fragment);
}

/** Domain SQL inside a multipart TX on a dedicated `PoolClient` (webapp or integrator connection). */
export async function runPurgeClientSql<T extends QueryResultRow = QueryResultRow>(
  client: PoolClient,
  fragment: SQL,
) {
  return runWebappSql<T>(getWebappSqlFromPgClient(client), fragment);
}
