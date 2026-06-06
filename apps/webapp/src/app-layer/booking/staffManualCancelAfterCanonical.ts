/**
 * Staff/admin cancel after canonical commit: partial outcomes with explicit flags.
 * @see docs/BOOKING_REWORK_INITIATIVE/BOOKING_MIRROR_INTEGRITY_CONTRACT.md
 */
import { applyStaffCancelSideEffects } from "@/app-layer/booking/staffAppointmentLifecycleEffects";
import {
  resolveRubitimeIdForAppointment,
  syncStaffCancelToRubitime,
} from "@/app-layer/booking/staffRubitimeMirrorOutbound";
import { isStaffRubitimeOutboundEnabled } from "@/app-layer/booking/staffRubitimeBridgePolicy";
import type { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import type { BeAppointment } from "@/modules/booking-engine/types";
import type { BookingSyncPort } from "@/modules/patient-booking/ports";
import { createBookingSyncPort } from "@/modules/integrator/bookingM2mApi";

export type StaffManualCancelFlags = {
  rubitimeMirrorFailed?: true;
  notificationOutcomeFailed?: true;
  paymentOutcomeFailed?: true;
  membershipOutcomeFailed?: true;
};

export async function runStaffManualCancelAfterCanonical(input: {
  deps: ReturnType<typeof buildAppDeps>;
  organizationId: string;
  appointmentId: string;
  actorId: string;
  actorType: "admin" | "specialist";
  decisionType: string;
  reason?: string;
  staffComment?: string;
  getRubitimeAppointmentId?: (params: {
    organizationId: string;
    appointmentId: string;
  }) => Promise<string | null>;
  appointment: BeAppointment;
  cancelPolicy: Parameters<typeof applyStaffCancelSideEffects>[0]["cancelPolicy"];
}): Promise<StaffManualCancelFlags> {
  const flags: StaffManualCancelFlags = {};
  const bookingRow = input.deps.patientBooking
    ? await input.deps.patientBooking.getBookingByCanonicalAppointment(input.appointmentId)
    : null;
  const rubitimeId = await resolveRubitimeIdForAppointment({
    appointmentId: input.appointmentId,
    organizationId: input.organizationId,
    bookingRow,
    getRubitimeAppointmentId: input.getRubitimeAppointmentId,
  });
  const syncPort: BookingSyncPort = createBookingSyncPort();
  const bridgeEnabled = await isStaffRubitimeOutboundEnabled(input.deps);
  if (rubitimeId && bridgeEnabled) {
    try {
      await syncStaffCancelToRubitime({
        rubitimeId,
        appointmentId: input.appointmentId,
        appointmentMirrorSync: input.deps.appointmentMirrorSync,
        syncPort,
      });
    } catch {
      flags.rubitimeMirrorFailed = true;
    }
  }

  if (input.deps.memberships) {
    try {
      await input.deps.memberships.applyCancelPackageOutcome({
        appointmentId: input.appointmentId,
        organizationId: input.organizationId,
        packageLessonDeducted: input.decisionType === "package_charged",
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
        prepaymentRetained: input.decisionType === "retain_prepayment",
        prepaymentRefunded: input.decisionType === "refund_prepayment",
        reason: input.reason,
      });
    } catch {
      flags.paymentOutcomeFailed = true;
    }
  }

  const { loadBookingLifecycleNotificationsFromSystemSettings } = await import(
    "@/modules/booking-notifications/settings"
  );
  const lifecycleNotificationSettings = await loadBookingLifecycleNotificationsFromSystemSettings(
    (key, scope) => input.deps.systemSettings.getSetting(key, scope),
  );
  try {
    await applyStaffCancelSideEffects({
      projection: input.deps.appointmentProjection,
      lifecycle: input.deps.bookingAppointmentLifecycle!,
      organizationId: input.organizationId,
      appointment: input.appointment,
      cancelPolicy: input.cancelPolicy,
      syncPort,
      bookingRow,
      lifecycleNotificationSettings,
      branches: input.deps.branches,
    });
  } catch {
    flags.notificationOutcomeFailed = true;
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
