#!/usr/bin/env node
/**
 * Prints projection_outbox health (pending, dead, oldest pending, retry distribution)
 * for release gate and deploy checklists. Uses DATABASE_URL from env.
 * Exit code: 0 if deadCount === 0 and pending is within bounds; non-zero otherwise.
 */
import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

async function getProjectionHealth(pool) {
  const [countsRes, oldestRes, distRes] = await Promise.all([
    pool.query(
      `SELECT status, count(*)::text AS cnt
       FROM projection_outbox
       WHERE status IN ('pending', 'processing', 'dead')
       GROUP BY status`,
    ),
    pool.query(
      `SELECT min(next_try_at)::text AS next_try_at
       FROM projection_outbox
       WHERE status = 'pending'`,
    ),
    pool.query(
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
  const retryDistribution = {};
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

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url || !url.trim()) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: url });
  try {
    const snapshot = await getProjectionHealth(pool);
    console.log(JSON.stringify(snapshot, null, 2));
    const ok = snapshot.deadCount === 0;
    process.exit(ok ? 0 : 1);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
