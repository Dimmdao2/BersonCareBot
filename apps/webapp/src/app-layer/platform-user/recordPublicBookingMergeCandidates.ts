import type { Pool } from "pg";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { findPublicBookingNameCollisionCandidates } from "@/infra/repos/pgPublicBookingMergeCandidates";

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

  const candidateUserIds = await findPublicBookingNameCollisionCandidates({
    pool: input.pool,
    anchorUserId: input.anchorUserId,
    contactName: name,
  });

  if (candidateUserIds.length === 0) return;

  const mergeSvc = buildAppDeps().patientMergeCandidate;
  if (!mergeSvc) return;

  for (const candidateUserId of candidateUserIds) {
    await mergeSvc.upsertPending({
      organizationId: input.organizationId,
      anchorUserId: input.anchorUserId,
      candidateUserId,
      reason: REASON,
      triggerAppointmentId: input.triggerAppointmentId,
      payload: { contactName: name },
    });
  }
}
