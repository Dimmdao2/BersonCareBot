import type { Pool, PoolClient, QueryResultRow } from "pg";
import { getWebappSqlFromPgClient, runPgPoolPgText, runWebappPgText } from "@/infra/db/runWebappSql";

/** Domain SQL on default Drizzle pool (same `getPool()`). */
export async function runIdentityPoolPgText<T = QueryResultRow>(
  queryText: string,
  values: readonly unknown[] = [],
) {
  return runWebappPgText<T>(queryText, values);
}

/** Domain SQL on an injected pool (tests / explicit pool arg). */
export async function runIdentityPoolPgTextOnPool<T extends QueryResultRow = QueryResultRow>(
  pool: Pick<Pool, "query">,
  queryText: string,
  values: readonly unknown[] = [],
) {
  return runPgPoolPgText<T>(pool, queryText, values);
}

/** Domain SQL inside a multipart TX on a dedicated `PoolClient`. */
export async function runIdentityClientPgText<T = QueryResultRow>(
  client: PoolClient,
  queryText: string,
  values: readonly unknown[] = [],
) {
  return runWebappPgText<T>(queryText, values, getWebappSqlFromPgClient(client));
}
