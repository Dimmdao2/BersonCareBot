import type { DbPort } from '../../../kernel/contracts/index.js';

/** Upsert `public.appointment_records` — same SQL as webapp `pgAppointmentProjection`. */
export async function upsertAppointmentRecordFromBookingMutation(
  db: DbPort,
  params: {
    integratorRecordId: string;
    phoneNormalized: string | null;
    recordAt: string | null;
    status: string;
    payloadJson: Record<string, unknown>;
    lastEvent: string;
    updatedAt: string;
    branchId?: string | null;
  },
): Promise<void> {
  await db.query(
    `INSERT INTO public.appointment_records (
      integrator_record_id, phone_normalized, record_at, status, payload_json, last_event, updated_at, branch_id
    ) VALUES ($1, $2, $3::timestamptz, $4, $5::jsonb, $6, $7::timestamptz, $8::uuid)
    ON CONFLICT (integrator_record_id) DO UPDATE SET
      phone_normalized = EXCLUDED.phone_normalized,
      record_at = EXCLUDED.record_at,
      status = EXCLUDED.status,
      payload_json = EXCLUDED.payload_json,
      last_event = EXCLUDED.last_event,
      updated_at = EXCLUDED.updated_at,
      branch_id = EXCLUDED.branch_id`,
    [
      params.integratorRecordId,
      params.phoneNormalized,
      params.recordAt,
      params.status,
      JSON.stringify(params.payloadJson),
      params.lastEvent,
      params.updatedAt,
      params.branchId ?? null,
    ],
  );
}
