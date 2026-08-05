import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { QueryResultRow } from 'pg';
import type { PlatformMergeDbClient } from './pgPlatformUserMerge.js';

const pgDialect = new PgDialect();

/** Compile Drizzle `sql` fragments for `PlatformMergeDbClient` (`pg` pool / integrator tx). */
export async function runMergeSql<R extends QueryResultRow = QueryResultRow>(
  db: PlatformMergeDbClient,
  fragment: SQL,
): Promise<{ rows: R[]; rowCount?: number }> {
  const { sql: text, params } = pgDialect.sqlToQuery(fragment);
  return db.query<R>(text, params);
}
