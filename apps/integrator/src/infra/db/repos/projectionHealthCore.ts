import { sql, type SQL } from 'drizzle-orm';

export type ProjectionHealthSnapshot = {
  pendingCount: number;
  deadCount: number;
  /** Rows intentionally excluded from delivery (e.g. merge outbox dedup); not the same as `dead` (DLQ). */
  cancelledCount: number;
  oldestPendingAt: string | null;
  processingCount: number;
  /** Count of rows by attempts_done (e.g. { 0: 5, 1: 2, 2: 1 }) for pending + processing */
  retryDistribution: Record<number, number>;
  /** Last time a projection event was successfully delivered (status = 'done') */
  lastSuccessAt: string | null;
  /** Count of pending+processing rows with attempts_done >= retryThreshold */
  retriesOverThreshold: number;
};

export type ProjectionHealthQueryable = {
  execute(fragment: SQL): Promise<{ rows: Record<string, unknown>[] }>;
};

export const DEFAULT_PROJECTION_HEALTH_RETRY_THRESHOLD = 3;

function executeRows<T>(
  db: ProjectionHealthQueryable,
  fragment: SQL,
): Promise<{ rows: T[] }> {
  return db.execute(fragment) as Promise<{ rows: T[] }>;
}

/**
 * Single runtime source of projection_outbox health metrics.
 *
 * All statements are parameterized Drizzle fragments and execute through the caller's DB
 * adapter. This keeps the runtime repository and the deploy CLI on the same DB boundary.
 */
export async function readProjectionHealthSnapshot(
  db: ProjectionHealthQueryable,
  options?: { retryThreshold?: number },
): Promise<ProjectionHealthSnapshot> {
  const threshold = options?.retryThreshold ?? DEFAULT_PROJECTION_HEALTH_RETRY_THRESHOLD;
  const [countsRes, oldestRes, distRes, lastSuccessRes, overThresholdRes] = await Promise.all([
    executeRows<{ status: string; cnt: string }>(db, sql`
      SELECT status, count(*)::text AS cnt
      FROM integrator.projection_outbox
      WHERE status IN ('pending', 'processing', 'dead', 'cancelled')
      GROUP BY status
    `),
    executeRows<{ next_try_at: string | null }>(db, sql`
      SELECT min(next_try_at)::text AS next_try_at
      FROM integrator.projection_outbox
      WHERE status = 'pending'
    `),
    executeRows<{ attempts_done: number; cnt: string }>(db, sql`
      SELECT attempts_done, count(*)::text AS cnt
      FROM integrator.projection_outbox
      WHERE status IN ('pending', 'processing')
      GROUP BY attempts_done
    `),
    executeRows<{ last_success: string | null }>(db, sql`
      SELECT max(updated_at)::text AS last_success
      FROM integrator.projection_outbox
      WHERE status = 'done'
    `),
    executeRows<{ cnt: string }>(db, sql`
      SELECT count(*)::text AS cnt
      FROM integrator.projection_outbox
      WHERE status IN ('pending', 'processing') AND attempts_done >= ${threshold}
    `),
  ]);

  let pendingCount = 0;
  let deadCount = 0;
  let cancelledCount = 0;
  let processingCount = 0;
  for (const row of countsRes.rows) {
    const n = parseInt(row.cnt, 10) || 0;
    if (row.status === 'pending') pendingCount = n;
    else if (row.status === 'dead') deadCount = n;
    else if (row.status === 'cancelled') cancelledCount = n;
    else if (row.status === 'processing') processingCount = n;
  }

  const oldestPendingAt = oldestRes.rows[0]?.next_try_at ?? null;
  const retryDistribution: Record<number, number> = {};
  for (const row of distRes.rows) {
    retryDistribution[row.attempts_done] = parseInt(row.cnt, 10) || 0;
  }
  const lastSuccessAt = lastSuccessRes.rows[0]?.last_success ?? null;
  const retriesOverThreshold = parseInt(overThresholdRes.rows[0]?.cnt ?? '0', 10) || 0;

  return {
    pendingCount,
    deadCount,
    cancelledCount,
    oldestPendingAt,
    processingCount,
    retryDistribution,
    lastSuccessAt,
    retriesOverThreshold,
  };
}

/**
 * Degraded when there are dead events or too many retries over threshold.
 * Used by stage13 gate, monitoring, and projection health CLI.
 */
export function isProjectionHealthDegraded(
  snapshot: ProjectionHealthSnapshot,
  options?: { allowDeadCount?: number; allowRetriesOverThreshold?: number },
): boolean {
  const allowDead = options?.allowDeadCount ?? 0;
  const allowRetries = options?.allowRetriesOverThreshold ?? 0;
  return snapshot.deadCount > allowDead || snapshot.retriesOverThreshold > allowRetries;
}
