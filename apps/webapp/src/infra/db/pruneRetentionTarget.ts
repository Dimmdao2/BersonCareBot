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
  'public_idempotency_keys',
  'integrator_idempotency_keys',
  'outgoing_delivery_queue_sent',
  'outgoing_delivery_queue_dead',
  'notification_delivery_attempts',
  // Systemic residual audit 2026-08-27: §C3 (consolidated reminder history — TERMINAL occurrences
  // only) and §E1 (doctor→patient message journal).
  'reminder_occurrence_history_terminal',
  'message_log',
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

/** Same bounds `app.prune_context_nonce_ledger` enforces (grace 0-86400s, limit 1-500000). */
export function clampContextNonceLedgerGraceSec(graceSec: number): number {
  return Math.min(86400, Math.max(0, Math.trunc(graceSec)));
}

export function clampContextNonceLedgerLimit(limit: number): number {
  return Math.min(500_000, Math.max(1, Math.trunc(limit)));
}

/**
 * `app.context_nonce_ledger` has no `prune_retention_target` branch — its ACL grants nothing but its
 * own owner (p2-b:356-359), and its window is minutes, not days. Dedicated named root, same
 * owner-owns-target pattern as `app.install_signed_context`.
 */
export async function pruneContextNonceLedger(
  graceSec: number,
  limit: number,
  options?: { dryRun?: boolean },
): Promise<number> {
  const grace = clampContextNonceLedgerGraceSec(graceSec);
  const cappedLimit = clampContextNonceLedgerLimit(limit);
  const dryRun = options?.dryRun === true;
  const result = await runWebappNamedRoot<{ affected_count: number | string }>(
    getWebappSqlDb(),
    'app.prune_context_nonce_ledger(integer,integer,boolean)',
    [grace, cappedLimit, dryRun],
    sql`SELECT app.prune_context_nonce_ledger(${grace}, ${cappedLimit}, ${dryRun}) AS affected_count`,
  );
  return Number(result.rows[0]?.affected_count ?? 0);
}
