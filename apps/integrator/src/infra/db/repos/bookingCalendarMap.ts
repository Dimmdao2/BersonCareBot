import { sql } from 'drizzle-orm';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { runIntegratorNamedRoot } from '../runIntegratorSql.js';

export async function getGoogleEventIdByAppointmentId(
  db: DbPort,
  appointmentId: string,
): Promise<string | null> {
  const result = await runIntegratorNamedRoot<{ gcal_event_id: string | null }>(
    db,
    'app.get_google_calendar_event_id(uuid)',
    [appointmentId],
    sql`SELECT app.get_google_calendar_event_id(${appointmentId}::uuid) AS gcal_event_id`,
  );
  return result.rows[0]?.gcal_event_id ?? null;
}

export async function upsertBookingCalendarEventId(
  db: DbPort,
  input: { appointmentId: string; gcalEventId: string },
): Promise<void> {
  await runIntegratorNamedRoot(
    db,
    'app.upsert_google_calendar_event_id(uuid,text)',
    [input.appointmentId, input.gcalEventId],
    sql`SELECT app.upsert_google_calendar_event_id(
      ${input.appointmentId}::uuid,
      ${input.gcalEventId}::text
    )`,
  );
}

export async function deleteBookingCalendarEventId(
  db: DbPort,
  appointmentId: string,
): Promise<void> {
  await runIntegratorNamedRoot(
    db,
    'app.delete_google_calendar_event_id(uuid)',
    [appointmentId],
    sql`SELECT app.delete_google_calendar_event_id(${appointmentId}::uuid)`,
  );
}
