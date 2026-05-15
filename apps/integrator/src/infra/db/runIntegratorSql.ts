import type { SQL } from 'drizzle-orm';
import type { DbPort, DbQueryResult } from '../../kernel/contracts/index.js';
import { getIntegratorDrizzleSession } from './drizzle.js';

/** Run a Drizzle `sql` fragment on the integrator session (pool or TX client). */
export async function runIntegratorSql<T = unknown>(db: DbPort, fragment: SQL): Promise<DbQueryResult<T>> {
  const d = getIntegratorDrizzleSession(db);
  const raw = await d.execute(fragment);
  const r = raw as { rows?: T[]; rowCount?: number };
  const out: DbQueryResult<T> = { rows: (r.rows ?? []) as T[] };
  if (typeof r.rowCount === 'number') {
    out.rowCount = r.rowCount;
  }
  return out;
}
