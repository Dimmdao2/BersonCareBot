import { eq, sql } from 'drizzle-orm';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { getIntegratorDrizzleSession } from '../drizzle.js';
import { runIntegratorSql } from '../runIntegratorSql.js';
import { bookingCalendarMap } from '../schema/integratorPublicProduct.js';

export async function getGoogleEventIdByRubitimeRecordId(
  db: DbPort,
  rubitimeRecordId: string,
): Promise<string | null> {
  const d = getIntegratorDrizzleSession(db);
  const rows = await d
    .select({ gcalEventId: bookingCalendarMap.gcalEventId })
    .from(bookingCalendarMap)
    .where(eq(bookingCalendarMap.rubitimeRecordId, rubitimeRecordId))
    .limit(1);
  return rows[0]?.gcalEventId ?? null;
}

export async function upsertBookingCalendarMap(
  db: DbPort,
  input: { rubitimeRecordId: string; gcalEventId: string },
): Promise<void> {
  const d = getIntegratorDrizzleSession(db);
  await d
    .insert(bookingCalendarMap)
    .values({
      rubitimeRecordId: input.rubitimeRecordId,
      gcalEventId: input.gcalEventId,
    })
    .onConflictDoUpdate({
      target: bookingCalendarMap.rubitimeRecordId,
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
      WHERE rubitime_id = ${input.rubitimeRecordId}`,
  );
}

export async function deleteBookingCalendarMap(db: DbPort, rubitimeRecordId: string): Promise<void> {
  const d = getIntegratorDrizzleSession(db);
  await d.delete(bookingCalendarMap).where(eq(bookingCalendarMap.rubitimeRecordId, rubitimeRecordId));
  await runIntegratorSql(
    db,
    sql`UPDATE public.patient_bookings
        SET gcal_event_id = NULL,
            updated_at = now()
      WHERE rubitime_id = ${rubitimeRecordId}`,
  );
}
