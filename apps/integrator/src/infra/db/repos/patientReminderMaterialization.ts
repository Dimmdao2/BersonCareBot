import { sql } from 'drizzle-orm';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { runIntegratorSql } from '../runIntegratorSql.js';

/** Binary claim-time permission; product decisions remain inside the exact DB capability. */
export async function revalidatePatientReminderDeliveryMaterialization(
  db: DbPort,
  queueId: string,
): Promise<boolean> {
  const result = await runIntegratorSql<{ current: boolean }>(
    db,
    sql`SELECT app.revalidate_patient_reminder_delivery_materialization(${queueId}::uuid) AS current`,
  );
  return result.rows[0]?.current === true;
}
