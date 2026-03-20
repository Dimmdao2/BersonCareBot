import type { DbPort } from '../../../kernel/contracts/index.js';

export type ProjectionHealthSnapshot = {
  pendingCount: number;
  deadCount: number;
  oldestPendingAt: string | null;
  processingCount: number;
  /** Count of rows by attempts_done (e.g. { 0: 5, 1: 2, 2: 1 }) for pending + processing */
  retryDistribution: Record<number, number>;
};

/**
 * Reads projection_outbox health for release gate and monitoring.
 * Reusable by health endpoint and CLI script.
 */
export async function getProjectionHealth(db: DbPort): Promise<ProjectionHealthSnapshot> {
  const [countsRes, oldestRes, distRes] = await Promise.all([
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

  return {
    pendingCount,
    deadCount,
    oldestPendingAt,
    processingCount,
    retryDistribution,
  };
}
