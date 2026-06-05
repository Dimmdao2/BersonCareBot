import type { Pool, PoolClient, QueryResultRow } from "pg";
import { getWebappSqlFromPgClient, runPgPoolPgText, runWebappPgText } from "@/infra/db/runWebappSql";

/** Domain SQL on default webapp pool. */
export async function runPurgePoolPgText<T extends QueryResultRow = QueryResultRow>(
  pool: Pick<Pool, "query">,
  queryText: string,
  values: readonly unknown[] = [],
) {
  return runPgPoolPgText<T>(pool, queryText, values);
}

/** Domain SQL inside a multipart TX on a dedicated `PoolClient` (webapp or integrator connection). */
export async function runPurgeClientPgText<T extends QueryResultRow = QueryResultRow>(
  client: PoolClient,
  queryText: string,
  values: readonly unknown[] = [],
) {
  return runWebappPgText<T>(queryText, values, getWebappSqlFromPgClient(client));
}
