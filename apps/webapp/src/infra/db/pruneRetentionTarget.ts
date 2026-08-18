import { sql } from 'drizzle-orm';
import { getWebappSqlDb, runWebappNamedRoot } from '@/infra/db/runWebappSql';

/**
 * Retention over a locked tenant table is cross-organization work: it deletes rows of every clinic
 * at once and therefore has no organization — while the only permissive runtime policy of these
 * tables demands `app_staff` plus an accepted organization. A relation DELETE here is dead by
 * construction: it silently affected zero rows while the organization accessor was VOLATILE, and
 * raises 42501 now that the same qual is evaluated once per statement.
 *
 * Every such sweep goes through ONE declared named root with a closed list of targets. The target
 * is a label the root expands into a static DELETE branch — never a table name spliced into SQL.
 */
export const RETENTION_SWEEP_TARGETS = [
  'media_hls_proxy_error_events',
  'product_analytics_events_recent',
  'product_analytics_user_hourly',
  'product_push_notifications',
] as const;

export type RetentionSweepTarget = (typeof RETENTION_SWEEP_TARGETS)[number];

/** Same bounds the root enforces; the root refuses anything outside them with 23514. */
export function clampRetentionDays(retentionDays: number): number {
  return Math.min(3650, Math.max(1, Math.trunc(retentionDays)));
}

export async function pruneRetentionTarget(
  target: RetentionSweepTarget,
  retentionDays: number,
  options?: { dryRun?: boolean },
): Promise<number> {
  const days = clampRetentionDays(retentionDays);
  const dryRun = options?.dryRun === true;
  const result = await runWebappNamedRoot<{ affected_count: number | string }>(
    getWebappSqlDb(),
    'app.prune_retention_target(text,integer,boolean)',
    [target, days, dryRun],
    sql`SELECT app.prune_retention_target(${target}, ${days}, ${dryRun}) AS affected_count`,
  );
  return Number(result.rows[0]?.affected_count ?? 0);
}
