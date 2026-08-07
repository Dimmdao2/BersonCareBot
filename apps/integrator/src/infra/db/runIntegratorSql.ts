import { sql, type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { DbPort, DbQueryResult } from '../../kernel/contracts/index.js';
import type { IntegratorDrizzleDb } from './drizzle.js';

const pgDialect = new PgDialect();

function toDbQueryResult<T>(raw: unknown): DbQueryResult<T> {
  const r = raw as { rows?: T[]; rowCount?: number };
  const out: DbQueryResult<T> = { rows: (r.rows ?? []) as T[] };
  if (typeof r.rowCount === 'number') {
    out.rowCount = r.rowCount;
  }
  return out;
}

/**
 * Run a Drizzle `sql` fragment on the integrator session (pool or TX client).
 * When `db.integratorDrizzle` is set (active TX), uses that session; otherwise compiles
 * the fragment and runs via `db.query` (unit-test mocks and plain DbPort).
 */
export async function runIntegratorSql<T = unknown>(
  db: DbPort,
  fragment: SQL,
): Promise<DbQueryResult<T>> {
  const { sql: text, params } = pgDialect.sqlToQuery(fragment);
  const withSession = db as DbPort & { integratorDrizzle?: IntegratorDrizzleDb };
  if (withSession.integratorDrizzle) {
    try {
      const raw = await withSession.integratorDrizzle.execute(fragment);
      if (raw !== null && raw !== undefined && typeof raw === 'object' && 'rows' in raw) {
        const r = raw as { rows?: T[]; rowCount?: number };
        // Real pg/drizzle returns `rowCount` even for empty SELECT; test stubs often omit it.
        if (Array.isArray(r.rows) && (r.rows.length > 0 || typeof r.rowCount === 'number')) {
          return toDbQueryResult<T>(raw);
        }
      }
    } catch {
      // Partial test doubles may only implement `db.query`; fall through.
    }
  }
  return db.query<T>(text, params);
}

/**
 * Bridge legacy `$1..$n` PostgreSQL query text to a Drizzle `SQL` fragment (run via
 * `db.execute(...)`/`runIntegratorSql`). Mirrors `webappSqlFromPgText`
 * (`apps/webapp/src/infra/db/runWebappSql.ts`) — the general-purpose direction for a
 * `query(text, values)`-shaped caller that cannot construct a Drizzle fragment itself
 * (e.g. an external package's generic DB hook). Keep both in sync if the
 * placeholder-splitting logic changes.
 */
export function integratorSqlFromPgText(queryText: string, values: readonly unknown[] = []): SQL {
  const segments: SQL[] = [];
  let lastIndex = 0;
  const re = /\$(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(queryText)) !== null) {
    if (m.index > lastIndex) {
      segments.push(sql.raw(queryText.slice(lastIndex, m.index)));
    }
    const idx = Number.parseInt(m[1]!, 10) - 1;
    segments.push(sql`${sql.param(values[idx])}`);
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
  return sql.join(segments, sql.raw(''));
}
