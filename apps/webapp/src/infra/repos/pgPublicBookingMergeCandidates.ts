import { sql } from 'drizzle-orm';
import { getWebappSqlDb, runWebappNamedRoot } from '@/infra/db/runWebappSql';

/**
 * Track D synthesis 26.08: this used to read `platform_users`/`user_contacts` through a bare `Pool`
 * with no principal installed at all (`getPool()` handed straight to `runPgPoolPgText` — see the
 * removed `pool` argument at the old call site in `app-layer/booking/createVerifiedPublicBooking.ts`).
 * Every call failed with "Missing declared webapp port capability: pre_session", caught, logged, and
 * the dependent write (a pending `patient_merge_candidates` row) never ran. One named door now does
 * the read AND the write atomically under the patient principal — see
 * `app.record_public_booking_merge_candidates` (migration `20260826T140000_…`).
 */
export async function recordPublicBookingMergeCandidatesNamedRoot(input: {
  organizationId: string;
  anchorUserId: string;
  contactName: string;
  triggerAppointmentId: string;
}): Promise<number> {
  const result = await runWebappNamedRoot<{ created_count: number }>(
    getWebappSqlDb(),
    'app.record_public_booking_merge_candidates(uuid,uuid,text,uuid)',
    [input.organizationId, input.anchorUserId, input.contactName, input.triggerAppointmentId],
    sql`SELECT app.record_public_booking_merge_candidates(
      ${input.organizationId}::uuid, ${input.anchorUserId}::uuid,
      ${input.contactName}::text, ${input.triggerAppointmentId}::uuid
    ) AS created_count`,
  );
  return Number(result.rows[0]?.created_count ?? 0);
}
