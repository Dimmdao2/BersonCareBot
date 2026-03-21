#!/usr/bin/env node
/**
 * Prints projection_outbox health for release gate and deploy checklists.
 * Uses INTEGRATOR_DATABASE_URL when set (gate from monorepo root), else DATABASE_URL.
 * Exit code: 0 when not degraded (no dead, retriesOverThreshold within bounds); 1 otherwise.
 */
import 'dotenv/config';
import pg from 'pg';
import { loadCutoverEnv } from '../../../scripts/load-cutover-env.mjs';

const { Pool } = pg;
const RETRY_THRESHOLD = 3;

loadCutoverEnv();

async function getProjectionHealth(pool) {
  const [countsRes, oldestRes, distRes, lastSuccessRes, overThresholdRes] = await Promise.all([
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
    pool.query(
      `SELECT max(updated_at)::text AS last_success
       FROM projection_outbox
       WHERE status = 'done'`,
    ),
    pool.query(
      `SELECT count(*)::text AS cnt
       FROM projection_outbox
       WHERE status IN ('pending', 'processing') AND attempts_done >= $1`,
      [RETRY_THRESHOLD],
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

function isDegraded(snapshot) {
  return snapshot.deadCount > 0 || snapshot.retriesOverThreshold > 0;
}

async function main() {
  const url =
    process.env.INTEGRATOR_DATABASE_URL ||
    process.env.SOURCE_DATABASE_URL ||
    process.env.DATABASE_URL;
  if (!url || !url.trim()) {
    console.error('INTEGRATOR_DATABASE_URL or DATABASE_URL is not set');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: url });
  try {
    const snapshot = await getProjectionHealth(pool);
    console.log(JSON.stringify(snapshot, null, 2));
    const ok = !isDegraded(snapshot);
    process.exit(ok ? 0 : 1);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
