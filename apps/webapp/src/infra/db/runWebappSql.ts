import type { SQL } from "drizzle-orm";
import type { PoolClient } from "pg";
import { getDrizzle, type DrizzleDb } from "@/app-layer/db/drizzle";
import { drizzleOnPgClient } from "@/infra/db/pgAdvisoryLock";

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

export async function runWebappTransaction<T>(
  fn: (tx: WebappSqlTransactionExecutor) => Promise<T>,
): Promise<T> {
  const db = getDrizzle();
  return db.transaction(async (tx) => fn(tx as WebappSqlTransactionExecutor));
}
