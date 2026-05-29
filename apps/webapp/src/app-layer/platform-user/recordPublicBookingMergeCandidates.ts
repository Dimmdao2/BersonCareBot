import type { Pool } from "pg";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

const REASON = "public_booking_phone_collision";

/**
 * При публичной записи по телефону: если есть другие client-профили без телефона
 * с тем же display_name — создаём pending-кандидата на ручной мердж.
 */
export async function recordPublicBookingMergeCandidates(input: {
  pool: Pool;
  organizationId: string;
  anchorUserId: string;
  contactName: string;
  triggerAppointmentId: string;
}): Promise<void> {
  const name = input.contactName.trim();
  if (name.length < 2) return;

  const candidates = await input.pool.query<{ id: string }>(
    `SELECT id
       FROM platform_users
      WHERE merged_into_id IS NULL
        AND role = 'client'
        AND id <> $1::uuid
        AND (phone_normalized IS NULL OR trim(phone_normalized) = '')
        AND lower(trim(display_name)) = lower(trim($2))
      LIMIT 5`,
    [input.anchorUserId, name],
  );

  if (candidates.rows.length === 0) return;

  const mergeSvc = buildAppDeps().patientMergeCandidate;
  if (!mergeSvc) return;

  for (const row of candidates.rows) {
    await mergeSvc.upsertPending({
      organizationId: input.organizationId,
      anchorUserId: input.anchorUserId,
      candidateUserId: row.id,
      reason: REASON,
      triggerAppointmentId: input.triggerAppointmentId,
      payload: { contactName: name },
    });
  }
}
