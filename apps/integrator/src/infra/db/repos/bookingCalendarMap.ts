import { eq, sql } from 'drizzle-orm';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { getIntegratorDrizzleSession } from '../drizzle.js';
import { runIntegratorSql } from '../runIntegratorSql.js';
import { bookingCalendarMap } from '../schema/integratorPublicProduct.js';

export async function getGoogleEventIdByAppointmentKey(
  db: DbPort,
  appointmentKey: string,
): Promise<string | null> {
  const d = getIntegratorDrizzleSession(db);
  const rows = await d
    .select({ gcalEventId: bookingCalendarMap.gcalEventId })
    .from(bookingCalendarMap)
    .where(eq(bookingCalendarMap.appointmentKey, appointmentKey))
    .limit(1);
  return rows[0]?.gcalEventId ?? null;
}

export async function upsertBookingCalendarMap(
  db: DbPort,
  input: { appointmentKey: string; gcalEventId: string },
): Promise<void> {
  const d = getIntegratorDrizzleSession(db);
  await d
    .insert(bookingCalendarMap)
    .values({
      appointmentKey: input.appointmentKey,
      gcalEventId: input.gcalEventId,
    })
    .onConflictDoUpdate({
      target: bookingCalendarMap.appointmentKey,
      set: {
        gcalEventId: input.gcalEventId,
        updatedAt: sql`now()`,
      },
    });

  await runIntegratorSql(
    db,
    sql`UPDATE public.patient_bookings
        SET gcal_event_id = ${input.gcalEventId},
            updated_at = now()
      WHERE canonical_appointment_id IS NOT NULL
        AND ${input.appointmentKey} LIKE 'be:%'
        AND canonical_appointment_id::text = substring(${input.appointmentKey} from 4)`,
  );
}

export async function deleteBookingCalendarMap(db: DbPort, appointmentKey: string): Promise<void> {
  const d = getIntegratorDrizzleSession(db);
  await d.delete(bookingCalendarMap).where(eq(bookingCalendarMap.appointmentKey, appointmentKey));
  await runIntegratorSql(
    db,
    sql`UPDATE public.patient_bookings
        SET gcal_event_id = NULL,
            updated_at = now()
      WHERE canonical_appointment_id IS NOT NULL
        AND ${appointmentKey} LIKE 'be:%'
        AND canonical_appointment_id::text = substring(${appointmentKey} from 4)`,
  );
}
