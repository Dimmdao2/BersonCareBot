import type { DbPort } from '../../../kernel/contracts/index.js';

export async function getGoogleEventIdByRubitimeRecordId(
  db: DbPort,
  rubitimeRecordId: string,
): Promise<string | null> {
  const res = await db.query<{ gcal_event_id: string | null }>(
    `SELECT gcal_event_id
       FROM booking_calendar_map
      WHERE rubitime_record_id = $1
      LIMIT 1`,
    [rubitimeRecordId],
  );
  return res.rows[0]?.gcal_event_id ?? null;
}

export async function upsertBookingCalendarMap(
  db: DbPort,
  input: { rubitimeRecordId: string; gcalEventId: string },
): Promise<void> {
  await db.query(
    `INSERT INTO booking_calendar_map (rubitime_record_id, gcal_event_id, created_at, updated_at)
     VALUES ($1, $2, now(), now())
     ON CONFLICT (rubitime_record_id)
     DO UPDATE SET gcal_event_id = EXCLUDED.gcal_event_id, updated_at = now()`,
    [input.rubitimeRecordId, input.gcalEventId],
  );

  await db.query(
    `UPDATE public.patient_bookings
        SET gcal_event_id = $2,
            updated_at = now()
      WHERE rubitime_id = $1`,
    [input.rubitimeRecordId, input.gcalEventId],
  );
}

export async function deleteBookingCalendarMap(
  db: DbPort,
  rubitimeRecordId: string,
): Promise<void> {
  await db.query(
    `DELETE FROM booking_calendar_map
      WHERE rubitime_record_id = $1`,
    [rubitimeRecordId],
  );
  await db.query(
    `UPDATE public.patient_bookings
        SET gcal_event_id = NULL,
            updated_at = now()
      WHERE rubitime_id = $1`,
    [rubitimeRecordId],
  );
}
