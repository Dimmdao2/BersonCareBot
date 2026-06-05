import type { SQL } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { Pool, QueryResultRow } from "pg";

const pgDialect = new PgDialect();

export type MediaWorkerQueryResult<T> = {
  rows: T[];
  rowCount?: number;
};

/**
 * Class B executor: Drizzle `sql` fragment → compiled text + params → existing `pg.Pool`.
 * No shared schema package; qualified `public.*` table names in SQL text.
 */
export async function runMediaWorkerSql<T extends QueryResultRow = QueryResultRow>(
  pool: Pool,
  fragment: SQL,
): Promise<MediaWorkerQueryResult<T>> {
  const { sql: text, params } = pgDialect.sqlToQuery(fragment);
  const r = await pool.query<T>(text, params);
  const out: MediaWorkerQueryResult<T> = { rows: r.rows ?? [] };
  if (typeof r.rowCount === "number") {
    out.rowCount = r.rowCount;
  }
  return out;
}

/**
 * Bridge legacy `$1..$n` PostgreSQL query text to Drizzle `execute(sql)`.
 * Parameter values are bound via Drizzle — SQL text must not embed user input.
 */
export function mediaWorkerSqlFromPgText(queryText: string, values: readonly unknown[] = []): SQL {
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

export async function runMediaWorkerPgText<T extends QueryResultRow = QueryResultRow>(
  pool: Pool,
  queryText: string,
  values: readonly unknown[] = [],
): Promise<MediaWorkerQueryResult<T>> {
  return runMediaWorkerSql<T>(pool, mediaWorkerSqlFromPgText(queryText, values));
}
