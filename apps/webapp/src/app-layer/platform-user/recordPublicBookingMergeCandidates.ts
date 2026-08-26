import { recordPublicBookingMergeCandidatesNamedRoot } from '@/infra/repos/pgPublicBookingMergeCandidates';

/**
 * При публичной записи по телефону: если есть другие client-профили без телефона
 * с тем же display_name — создаём pending-кандидата на ручной мердж.
 *
 * Read (name-collision candidates) and write (upsert pending candidates) commit atomically in one
 * named DB door under the caller's own principal — see `pgPublicBookingMergeCandidatesNamedRoot`.
 * The length check below is a cheap early-out; the door re-checks it (a door does not trust its
 * caller, same as every other door in this file's neighbourhood).
 */
export async function recordPublicBookingMergeCandidates(input: {
  organizationId: string;
  anchorUserId: string;
  contactName: string;
  triggerAppointmentId: string;
}): Promise<void> {
  const name = input.contactName.trim();
  if (name.length < 2) return;

  await recordPublicBookingMergeCandidatesNamedRoot({
    organizationId: input.organizationId,
    anchorUserId: input.anchorUserId,
    contactName: name,
    triggerAppointmentId: input.triggerAppointmentId,
  });
}
