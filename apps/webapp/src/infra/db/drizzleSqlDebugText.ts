import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

/**
 * Best-effort string for asserts on Drizzle `sql` fragments (Vitest / debug).
 */
export function drizzleSqlFragmentToApproximateSql(node: unknown): string {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean')
    return String(node);
  if (typeof node !== 'object') return '';
  const rec = node as Record<string, unknown>;
  if (Array.isArray(rec.queryChunks)) {
    return rec.queryChunks.map((c) => drizzleSqlFragmentToApproximateSql(c)).join('');
  }
  if (Array.isArray(rec.value)) {
    return rec.value.map((c) => drizzleSqlFragmentToApproximateSql(c)).join('');
  }
  return '';
}

const pgDialect = new PgDialect();

/**
 * Exact `$n` text and bound parameters of a fragment, as PostgreSQL receives them — the same
 * compilation `runPgPoolSql` performs. Asserts about *what a query binds* use this rather than
 * the approximate renderer above, which drops parameters entirely.
 */
export function drizzleSqlFragmentToPgQuery(fragment: SQL): { sql: string; values: unknown[] } {
  const { sql, params } = pgDialect.sqlToQuery(fragment);
  return { sql, values: params };
}
