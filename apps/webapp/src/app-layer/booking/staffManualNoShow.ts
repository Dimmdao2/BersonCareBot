/**
 * Staff/admin mark-no-show after canonical commit: partial outcomes with explicit flags.
 * Mirrors staffManualCancelAfterCanonical.ts — same pattern for side effects.
 */
import { applyStaffNoShowSideEffects } from "@/app-layer/booking/staffAppointmentLifecycleEffects";
import type { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import type { BeAppointment } from "@/modules/booking-engine/types";
import { createBookingSyncPort } from "@/modules/integrator/bookingM2mApi";

export type StaffNoShowFlags = {
  notificationOutcomeFailed?: true;
};

export async function runStaffManualNoShowAfterCanonical(input: {
  deps: ReturnType<typeof buildAppDeps>;
  organizationId: string;
  appointmentId: string;
  appointment: BeAppointment;
  /** R21 pattern: false → suppress patient notification. Default: true (notify). */
  notifyPatient?: boolean;
}): Promise<StaffNoShowFlags> {
  const flags: StaffNoShowFlags = {};
  const bookingRow = input.deps.patientBooking
    ? await input.deps.patientBooking.getBookingByCanonicalAppointment(input.appointmentId)
    : null;

  const syncPort = createBookingSyncPort();

  const { loadBookingLifecycleNotificationsFromSystemSettings } = await import(
    "@/modules/booking-notifications/settings"
  );
  const lifecycleNotificationSettings = await loadBookingLifecycleNotificationsFromSystemSettings(
    (key, scope) => input.deps.systemSettings.getSetting(key, scope),
  );

  try {
    await applyStaffNoShowSideEffects({
      projection: input.deps.appointmentProjection,
      lifecycle: input.deps.bookingAppointmentLifecycle!,
      organizationId: input.organizationId,
      appointment: input.appointment,
      syncPort,
      bookingRow,
      lifecycleNotificationSettings,
      branches: input.deps.branches,
      suppressPatientNotification: input.notifyPatient === false,
    });
  } catch {
    flags.notificationOutcomeFailed = true;
  }

  return flags;
}
