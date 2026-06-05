import type { SQL } from 'drizzle-orm';
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
export async function runIntegratorSql<T = unknown>(db: DbPort, fragment: SQL): Promise<DbQueryResult<T>> {
  const { sql: text, params } = pgDialect.sqlToQuery(fragment);
  // Canonical admin settings live in `public` — always use DbPort.query (also matches unit-test doubles).
  if (text.includes('public.system_settings')) {
    return db.query<T>(text, params);
  }

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
