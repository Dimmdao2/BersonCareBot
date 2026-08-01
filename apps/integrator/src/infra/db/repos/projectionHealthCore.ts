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
  query<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
};

export const DEFAULT_PROJECTION_HEALTH_RETRY_THRESHOLD = 3;

/**
 * Single runtime source of projection_outbox health metrics.
 *
 * Kept as parameterized SQL (D18, real exception — see `check-no-new-raw-sql.mjs` manifest).
 * `infra/scripts/projection-health.ts` (deploy-gate CLI) calls this on a bare
 * `pg.Pool` it builds itself from a gate-resolved connection string, deliberately
 * without booting the app's `DbPort`/Drizzle bridge or its `config/env.ts` (which
 * requires `APP_BASE_URL` and other app-only env the gate never sets). Requiring a
 * Drizzle session here would force the CLI through that bridge and break the gate
 * contract; `ProjectionHealthQueryable` (`db.query(text, params)`) is the shared shape
 * both the HTTP path (`DbPort`) and the bare pool already satisfy.
 */
export async function readProjectionHealthSnapshot(
  db: ProjectionHealthQueryable,
  options?: { retryThreshold?: number },
): Promise<ProjectionHealthSnapshot> {
  const threshold = options?.retryThreshold ?? DEFAULT_PROJECTION_HEALTH_RETRY_THRESHOLD;
  const [countsRes, oldestRes, distRes, lastSuccessRes, overThresholdRes] = await Promise.all([
    db.query<{ status: string; cnt: string }>(
      `SELECT status, count(*)::text AS cnt
       FROM integrator.projection_outbox
       WHERE status IN ('pending', 'processing', 'dead', 'cancelled')
       GROUP BY status`,
    ),
    db.query<{ next_try_at: string | null }>(
      `SELECT min(next_try_at)::text AS next_try_at
       FROM integrator.projection_outbox
       WHERE status = 'pending'`,
    ),
    db.query<{ attempts_done: number; cnt: string }>(
      `SELECT attempts_done, count(*)::text AS cnt
       FROM integrator.projection_outbox
       WHERE status IN ('pending', 'processing')
       GROUP BY attempts_done`,
    ),
    db.query<{ last_success: string | null }>(
      `SELECT max(updated_at)::text AS last_success
       FROM integrator.projection_outbox
       WHERE status = 'done'`,
    ),
    db.query<{ cnt: string }>(
      `SELECT count(*)::text AS cnt
       FROM integrator.projection_outbox
       WHERE status IN ('pending', 'processing') AND attempts_done >= $1`,
      [threshold],
    ),
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
