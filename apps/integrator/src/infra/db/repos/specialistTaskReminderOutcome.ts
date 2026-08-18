import { sql } from 'drizzle-orm';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { runWithDeliveryWorkerPrincipal } from '../../principal/organizationPrincipal.js';
import { runIntegratorSql } from '../runIntegratorSql.js';

/** Applies the durable queue-owned success outcome through the exact DB capability. */
export async function applySpecialistTaskReminderSuccessOutcome(
  db: DbPort,
  queueId: string,
): Promise<boolean> {
  const result = await runIntegratorSql<{ applied: boolean }>(
    db,
    sql`SELECT app.apply_specialist_task_reminder_success_outcome(${queueId}::uuid) AS applied`,
  );
  return result.rows[0]?.applied === true;
}

/**
 * Claim-time guard for a webapp-materialized specialist reminder. The exact DB capability owns
 * the comparison and moves a stale row back to a producer-replaceable state; the delivery worker
 * receives only the binary transport permission and never reconstructs product preferences.
 */
export async function revalidateSpecialistTaskReminderMaterialization(
  db: DbPort,
  queueId: string,
): Promise<boolean> {
  const result = await runWithDeliveryWorkerPrincipal(() =>
    runIntegratorSql<{ current: boolean }>(
      db,
      sql`SELECT app.revalidate_specialist_task_reminder_materialization(${queueId}::uuid) AS current`,
    ),
  );
  return result.rows[0]?.current === true;
}
