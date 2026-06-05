import type { SQL } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import { getDrizzle, type DrizzleDb } from "@/app-layer/db/drizzle";
import { drizzleOnPgClient } from "@/infra/db/pgAdvisoryLock";

const pgDialect = new PgDialect();

export type WebappQueryResult<T> = {
  rows: T[];
  rowCount?: number;
};

type DrizzleTransactionClient = Parameters<Parameters<DrizzleDb["transaction"]>[0]>[0];

/** Active transaction client (`rollback()` on drizzle-orm pg-core ≥0.45). */
export type WebappSqlTransactionExecutor = DrizzleTransactionClient & {
  rollback: () => never;
};

/** Drizzle session: default pool or active `db.transaction` callback arg. */
export type WebappSqlExecutor = DrizzleDb | WebappSqlTransactionExecutor;

function normalizeExecute<T>(raw: unknown): WebappQueryResult<T> {
  if (Array.isArray(raw)) {
    return { rows: raw as T[] };
  }
  const r = raw as { rows?: T[]; rowCount?: number };
  const out: WebappQueryResult<T> = { rows: r.rows ?? [] };
  if (typeof r.rowCount === "number") {
    out.rowCount = r.rowCount;
  }
  return out;
}

export function getWebappSqlDb(): DrizzleDb {
  return getDrizzle();
}

/** Drizzle executor on a dedicated `PoolClient` (multipart tx, session advisory locks). */
export function getWebappSqlFromPgClient(client: PoolClient): WebappSqlExecutor {
  return drizzleOnPgClient(client) as unknown as WebappSqlExecutor;
}

export async function runWebappSql<T = unknown>(
  db: WebappSqlExecutor,
  fragment: SQL,
): Promise<WebappQueryResult<T>> {
  const raw = await db.execute(fragment);
  return normalizeExecute<T>(raw);
}

/**
 * Bridge legacy `$1..$n` PostgreSQL query text to Drizzle `execute(sql)`.
 * Parameter values are bound via Drizzle — SQL text must not embed user input.
 */
export function webappSqlFromPgText(queryText: string, values: readonly unknown[] = []): SQL {
  const segments: SQL[] = [];
  let lastIndex = 0;
  const re = /\$(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(queryText)) !== null) {
    if (m.index > lastIndex) {
      segments.push(sql.raw(queryText.slice(lastIndex, m.index)));
    }
    const idx = Number.parseInt(m[1]!, 10) - 1;
    segments.push(sql`${values[idx]}`);
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < queryText.length) {
    segments.push(sql.raw(queryText.slice(lastIndex)));
  }
  if (segments.length === 0) {
    return sql.raw(queryText);
  }
  if (segments.length === 1) {
    return segments[0]!;
  }
  return sql.join(segments, sql.raw(""));
}

export async function runWebappPgText<T = unknown>(
  queryText: string,
  values: readonly unknown[] = [],
  db: WebappSqlExecutor = getWebappSqlDb(),
): Promise<WebappQueryResult<T>> {
  return runWebappSql<T>(db, webappSqlFromPgText(queryText, values));
}

/** Class B transport: compile `sql` fragment → `pool.query` (integrator purge pool, legacy pool args). */
export async function runPgPoolPgText<T extends QueryResultRow = QueryResultRow>(
  pool: Pick<Pool, "query">,
  queryText: string,
  values: readonly unknown[] = [],
): Promise<WebappQueryResult<T>> {
  const { sql: text, params } = pgDialect.sqlToQuery(webappSqlFromPgText(queryText, values));
  const r = await pool.query<T>(text, params);
  const out: WebappQueryResult<T> = { rows: r.rows ?? [] };
  if (typeof r.rowCount === "number") {
    out.rowCount = r.rowCount;
  }
  return out;
}

export async function runWebappTransaction<T>(
  fn: (tx: WebappSqlTransactionExecutor) => Promise<T>,
): Promise<T> {
  const db = getDrizzle();
  return db.transaction(async (tx) => fn(tx as WebappSqlTransactionExecutor));
}
