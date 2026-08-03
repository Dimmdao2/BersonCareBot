import { sql } from 'drizzle-orm';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { runIntegratorSql } from '../runIntegratorSql.js';

export async function revalidateAppointmentReminderMaterialization(
  db: DbPort,
  queueId: string,
): Promise<boolean> {
  const result = await runIntegratorSql<{ current: boolean }>(
    db,
    sql`SELECT app.revalidate_appointment_reminder_materialization(${queueId}::uuid) AS current`,
  );
  return result.rows[0]?.current === true;
}

export async function advanceAppointmentReminderMessengerLadder(
  db: DbPort,
  input: { queueId: string; expectedAttemptCount: number; error: string },
): Promise<'advanced' | 'dead' | 'not_transitioned'> {
  const result = await runIntegratorSql<{ transition: string }>(
    db,
    sql`SELECT app.advance_appointment_reminder_messenger_ladder(
      ${input.queueId}::uuid, ${input.expectedAttemptCount}::integer, ${input.error}::text
    ) AS transition`,
  );
  const value = result.rows[0]?.transition;
  return value === 'advanced' || value === 'dead' ? value : 'not_transitioned';
}
