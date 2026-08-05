import { type SQL, sql } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { QueryResultRow } from 'pg';
import type { PlatformMergeDbClient } from './pgPlatformUserMerge.js';

const pgDialect = new PgDialect();

/** Bind `$1..$n` PostgreSQL text for {@link runMergeSql} (array params via `sql.param`). */
function mergeSqlFromPgText(queryText: string, values: readonly unknown[] = []): SQL {
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

/** Legacy `$1..$n` queries compiled through Drizzle for {@link runMergeSql}. */
export async function runMergePgText<R extends QueryResultRow = QueryResultRow>(
  db: PlatformMergeDbClient | MergeSqlExecutor,
  queryText: string,
  values: readonly unknown[] = [],
): Promise<{ rows: R[]; rowCount?: number }> {
  return runMergeSql<R>(db, mergeSqlFromPgText(queryText, values));
}

/** Drizzle `execute` surface — webapp `runWebappSql`, integrator `PlatformMergeDbClient`. */
export type MergeSqlExecutor = {
  executeSql<R extends QueryResultRow = QueryResultRow>(
    fragment: SQL,
  ): Promise<{ rows: R[]; rowCount?: number }>;
};

export function mergeDbClientToSqlExecutor(db: PlatformMergeDbClient): MergeSqlExecutor {
  return {
    executeSql: async (fragment) => {
      const { sql: text, params } = pgDialect.sqlToQuery(fragment);
      return db.query(text, params);
    },
  };
}

function isMergeSqlExecutor(db: PlatformMergeDbClient | MergeSqlExecutor): db is MergeSqlExecutor {
  return 'executeSql' in db && typeof db.executeSql === 'function';
}

function normalizeMergeSqlDb(db: PlatformMergeDbClient | MergeSqlExecutor): MergeSqlExecutor {
  if (isMergeSqlExecutor(db)) {
    return db;
  }
  return mergeDbClientToSqlExecutor(db);
}

/** Compile Drizzle `sql` fragments for merge DB ports (`pg` pool / integrator tx / webapp Drizzle). */
export async function runMergeSql<R extends QueryResultRow = QueryResultRow>(
  db: PlatformMergeDbClient | MergeSqlExecutor,
  fragment: SQL,
): Promise<{ rows: R[]; rowCount?: number }> {
  return normalizeMergeSqlDb(db).executeSql<R>(fragment);
}
