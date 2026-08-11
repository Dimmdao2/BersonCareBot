import { sql } from 'drizzle-orm';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { runIntegratorNamedRoot } from '../runIntegratorSql.js';

export async function revalidateAppointmentReminderMaterialization(
  db: DbPort,
  queueId: string,
): Promise<boolean> {
  const result = await runIntegratorNamedRoot<{ current: boolean }>(
    db,
    'app.revalidate_appointment_reminder_materialization(uuid)',
    [queueId],
    sql`SELECT app.revalidate_appointment_reminder_materialization(${queueId}::uuid) AS current`,
  );
  return result.rows[0]?.current === true;
}

export async function advanceAppointmentReminderMessengerLadder(
  db: DbPort,
  input: { queueId: string; expectedAttemptCount: number; error: string },
): Promise<'advanced' | 'dead' | 'not_transitioned'> {
  const result = await runIntegratorNamedRoot<{ transition: string }>(
    db,
    'app.advance_appointment_reminder_messenger_ladder(uuid,integer,text)',
    [input.queueId, input.expectedAttemptCount, input.error],
    sql`SELECT app.advance_appointment_reminder_messenger_ladder(
      ${input.queueId}::uuid, ${input.expectedAttemptCount}::integer, ${input.error}::text
    ) AS transition`,
  );
  const value = result.rows[0]?.transition;
  return value === 'advanced' || value === 'dead' ? value : 'not_transitioned';
}
