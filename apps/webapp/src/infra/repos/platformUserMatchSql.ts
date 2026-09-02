import { sql, type SQL } from 'drizzle-orm';

/**
 * Owner predicate for the dual-id diary/preference tables: the canonical
 * `platform_user_id`, falling back to the pre-canonical text `user_id` on rows that were
 * never backfilled. Four repositories carried a private copy of this predicate, each with
 * its own manual `$n` numbering; this is the single definition they now share.
 *
 * `tableAlias` is a caller-owned SQL identifier and stays raw. `userId` is bound.
 */
export function platformUserMatchSql(tableAlias: string | null, userId: string): SQL {
  const column = (name: string) => sql.raw(tableAlias ? `${tableAlias}.${name}` : name);
  return sql`(${column('platform_user_id')} = ${userId}::uuid OR (${column('platform_user_id')} IS NULL AND ${column('user_id')} = ${userId}::text))`;
}
