import { sql } from 'drizzle-orm';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { getIntegratorDrizzleSession } from '../drizzle.js';
import { runIntegratorNamedRoot } from '../runIntegratorSql.js';
import {
  isProjectionHealthDegraded,
  readProjectionHealthSnapshot,
  type ProjectionHealthSnapshot,
} from './projectionHealthCore.js';
import { runWithInfraPrincipal } from '../../principal/organizationPrincipal.js';

export { isProjectionHealthDegraded };
export type { ProjectionHealthSnapshot } from './projectionHealthCore.js';

/**
 * Reads projection_outbox health for release gate and monitoring.
 * Summary covers all domains (single outbox). Reusable by health endpoint and CLI script.
 * Includes **`cancelledCount`** (e.g. merge dedup) separately from **`deadCount`** (DLQ).
 */
export async function getProjectionHealth(
  db: DbPort,
  options?: { retryThreshold?: number },
): Promise<ProjectionHealthSnapshot> {
  const retryThreshold = options?.retryThreshold ?? 3;
  return runWithInfraPrincipal({ source: 'integrator-projection-health' }, async () => {
    if (process.env.DB_PRINCIPAL_CONTEXT_MODE !== 'port-context') {
      return readProjectionHealthSnapshot(getIntegratorDrizzleSession(db), { retryThreshold });
    }
    const result = await runIntegratorNamedRoot<{
      pending_count: string;
      dead_count: string;
      cancelled_count: string;
      oldest_pending_at: string | null;
      processing_count: string;
      retry_distribution: Record<string, number>;
      last_success_at: string | null;
      retries_over_threshold: string;
    }>(
      db,
      'app.read_integrator_projection_health(integer)',
      [retryThreshold],
      sql`SELECT * FROM app.read_integrator_projection_health(${retryThreshold}::integer)`,
    );
    const row = result.rows[0];
    if (!row) throw new Error('Projection health seam returned no row');
    return {
      pendingCount: Number.parseInt(row.pending_count, 10) || 0,
      deadCount: Number.parseInt(row.dead_count, 10) || 0,
      cancelledCount: Number.parseInt(row.cancelled_count, 10) || 0,
      oldestPendingAt: row.oldest_pending_at,
      processingCount: Number.parseInt(row.processing_count, 10) || 0,
      retryDistribution: Object.fromEntries(
        Object.entries(row.retry_distribution).map(([attempts, count]) => [Number(attempts), count]),
      ),
      lastSuccessAt: row.last_success_at,
      retriesOverThreshold: Number.parseInt(row.retries_over_threshold, 10) || 0,
    };
  });
}
