import { sql } from 'drizzle-orm';
import type { DbPort } from '../../../kernel/contracts/index.js';
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
