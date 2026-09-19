/**
 * Staff/admin cancel after canonical commit: partial outcomes with explicit flags.
 * @see docs/BOOKING_REWORK_INITIATIVE/BOOKING_MIRROR_INTEGRITY_CONTRACT.md
 */
import type { buildAppDeps } from '@/app-layer/di/buildAppDeps';

export type StaffManualCancelFlags = {
  notificationOutcomeFailed?: true;
  paymentOutcomeFailed?: true;
  membershipOutcomeFailed?: true;
};

export async function runStaffManualCancelAfterCanonical(input: {
  deps: ReturnType<typeof buildAppDeps>;
  organizationId: string;
  appointmentId: string;
  actorId: string;
  decisionType: string;
  reason?: string;
}): Promise<StaffManualCancelFlags> {
  const flags: StaffManualCancelFlags = {};
  if (input.deps.memberships) {
    try {
      await input.deps.memberships.applyCancelPackageOutcome({
        appointmentId: input.appointmentId,
        organizationId: input.organizationId,
        packageLessonDeducted: input.decisionType === 'package_charged',
        createdByPlatformUserId: input.actorId,
      });
    } catch {
      flags.membershipOutcomeFailed = true;
    }
  }
  if (input.deps.payments) {
    try {
      await input.deps.payments.applyCancelPaymentOutcome({
        appointmentId: input.appointmentId,
        organizationId: input.organizationId,
        prepaymentRetained: input.decisionType === 'retain_prepayment',
        prepaymentRefunded:
          input.decisionType === 'free' || input.decisionType === 'refund_prepayment',
        reason: input.reason,
      });
    } catch {
      await input.deps.payments.enqueueCancelledAppointmentPaymentReconciliation({
        appointmentId: input.appointmentId,
      });
      flags.paymentOutcomeFailed = true;
    }
  }

  if (input.deps.patientBooking) {
    try {
      await input.deps.patientBooking.syncLinkedPatientBookingCancelled({
        canonicalAppointmentId: input.appointmentId,
        reason: input.reason,
      });
    } catch {
      // Best-effort mirror close; canonical cancel already committed.
    }
  }
  return flags;
}
