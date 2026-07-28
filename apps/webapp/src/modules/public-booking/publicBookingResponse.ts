/**
 * A-3 oracle #1: the public booking response used to hand an anonymous caller the matched person's
 * real `platform_users.id` — both as `userId` on the envelope and as `booking.userId`. Submitting a
 * phone and reading back a stable identifier is an account-existence oracle by itself, and it also
 * gives an attacker a durable handle on the victim.
 *
 * The public widget never used either field (see `shared/publicBook/usePublicCreateBooking.ts`), so
 * they are dropped rather than masked. One function, so a new public surface cannot forget.
 */
import type { PatientBookingRecord } from '@/modules/patient-booking/types';

export type PublicBookingRecordView = Omit<PatientBookingRecord, 'userId'>;

export function redactPublicBookingRecord(booking: PatientBookingRecord): PublicBookingRecordView {
  const { userId: _userId, ...rest } = booking;
  return rest;
}
