import type { DbPort } from '../../../kernel/contracts/index.js';

export type ProjectionHealthSnapshot = {
  pendingCount: number;
  deadCount: number;
  oldestPendingAt: string | null;
  processingCount: number;
  /** Count of rows by attempts_done (e.g. { 0: 5, 1: 2, 2: 1 }) for pending + processing */
  retryDistribution: Record<number, number>;
  /** Last time a projection event was successfully delivered (status = 'done') */
  lastSuccessAt: string | null;
  /** Count of pending+processing rows with attempts_done >= retryThreshold */
  retriesOverThreshold: number;
};

const DEFAULT_RETRY_THRESHOLD = 3;

/**
 * Reads projection_outbox health for release gate and monitoring.
 * Summary covers all domains (single outbox). Reusable by health endpoint and CLI script.
 */
export async function getProjectionHealth(
  db: DbPort,
  options?: { retryThreshold?: number },
): Promise<ProjectionHealthSnapshot> {
  const threshold = options?.retryThreshold ?? DEFAULT_RETRY_THRESHOLD;
  const [countsRes, oldestRes, distRes, lastSuccessRes, overThresholdRes] = await Promise.all([
    db.query<{ status: string; cnt: string }>(
      `SELECT status, count(*)::text AS cnt
       FROM projection_outbox
       WHERE status IN ('pending', 'processing', 'dead')
       GROUP BY status`,
    ),
    db.query<{ next_try_at: string | null }>(
      `SELECT min(next_try_at)::text AS next_try_at
       FROM projection_outbox
       WHERE status = 'pending'`,
    ),
    db.query<{ attempts_done: number; cnt: string }>(
      `SELECT attempts_done, count(*)::text AS cnt
       FROM projection_outbox
       WHERE status IN ('pending', 'processing')
       GROUP BY attempts_done`,
    ),
    db.query<{ last_success: string | null }>(
      `SELECT max(updated_at)::text AS last_success
       FROM projection_outbox
       WHERE status = 'done'`,
    ),
    db.query<{ cnt: string }>(
      `SELECT count(*)::text AS cnt
       FROM projection_outbox
       WHERE status IN ('pending', 'processing') AND attempts_done >= $1`,
      [threshold],
    ),
  ]);

  let pendingCount = 0;
  let deadCount = 0;
  let processingCount = 0;
  for (const row of countsRes.rows) {
    const n = parseInt(row.cnt, 10) || 0;
    if (row.status === 'pending') pendingCount = n;
    else if (row.status === 'dead') deadCount = n;
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
    oldestPendingAt,
    processingCount,
    retryDistribution,
    lastSuccessAt,
    retriesOverThreshold,
  };
}

/**
 * Degraded when there are dead events or too many retries over threshold.
 * Used by stage13 gate and monitoring.
 */
export function isProjectionHealthDegraded(
  snapshot: ProjectionHealthSnapshot,
  options?: { allowDeadCount?: number; allowRetriesOverThreshold?: number },
): boolean {
  const allowDead = options?.allowDeadCount ?? 0;
  const allowRetries = options?.allowRetriesOverThreshold ?? 0;
  return snapshot.deadCount > allowDead || snapshot.retriesOverThreshold > allowRetries;
}
