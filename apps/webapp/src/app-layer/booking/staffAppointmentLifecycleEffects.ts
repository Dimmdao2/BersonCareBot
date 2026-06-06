import type { createBookingAppointmentLifecycleService } from "@/modules/booking-appointment-lifecycle/service";
import type { CancellationPolicy, ReschedulePolicy } from "@/modules/booking-policies/types";
import type { BeAppointment } from "@/modules/booking-engine/types";
import {
  buildBookingNotificationsSent,
  resolveBookingNotifyTargets,
  type BookingLifecycleNotificationsSettings,
} from "@/modules/patient-booking/bookingLifecycleNotifications";
import type { AppointmentProjectionPort, BookingSyncPort } from "@/modules/patient-booking/ports";
import type { PatientBookingRecord } from "@/modules/patient-booking/types";
import { emitStaffCanonicalBookingEvent } from "@/app-layer/booking/staffBookingIntegratorEvent";
import {
  projectCanonicalAppointmentCancelled,
  projectCanonicalAppointmentRescheduled,
} from "@/modules/patient-booking/projectCanonicalAppointment";

import { resolveLegacyBranchIdForProjection } from "@/modules/patient-booking/resolveLegacyBranchIdForProjection";
import type { LegacyBranchProjectionPort } from "@/modules/patient-booking/ports";

type LifecycleService = ReturnType<typeof createBookingAppointmentLifecycleService>;

async function projectionFromAppointment(
  appt: BeAppointment,
  bookingRow?: PatientBookingRecord | null,
  branches?: LegacyBranchProjectionPort | null,
) {
  const attr = appt.attributionJson ?? {};
  const contactName =
    typeof attr.contact_name === "string"
      ? attr.contact_name
      : typeof attr.contactName === "string"
        ? attr.contactName
        : "Пациент";
  const serviceTitle =
    typeof attr.service_title === "string"
      ? attr.service_title
      : typeof attr.serviceTitle === "string"
        ? attr.serviceTitle
        : null;
  const legacyBranchId = await resolveLegacyBranchIdForProjection(
    branches,
    bookingRow?.rubitimeBranchIdSnapshot ?? null,
    bookingRow?.branchTitleSnapshot ?? null,
  );
  return {
    phoneNormalized: appt.phoneNormalized,
    contactName,
    serviceTitle,
    branchTitle: bookingRow?.branchTitleSnapshot ?? null,
    rubitimeRecordId: bookingRow?.rubitimeId ?? null,
    legacyBranchId,
  };
}

export async function applyStaffCancelSideEffects(opts: {
  projection: AppointmentProjectionPort | null | undefined;
  lifecycle: LifecycleService;
  organizationId: string;
  appointment: BeAppointment;
  cancelPolicy: CancellationPolicy;
  syncPort?: BookingSyncPort | null;
  bookingRow?: PatientBookingRecord | null;
  lifecycleNotificationSettings?: BookingLifecycleNotificationsSettings | null;
  branches?: LegacyBranchProjectionPort | null;
}): Promise<void> {
  if (opts.projection) {
    await projectCanonicalAppointmentCancelled(
      opts.projection,
      opts.appointment,
      await projectionFromAppointment(opts.appointment, opts.bookingRow, opts.branches),
    );
  }
  const integratorStatus = await emitStaffCanonicalBookingEvent({
    syncPort: opts.syncPort,
    eventType: "booking.cancelled",
    appointment: opts.appointment,
    bookingRow: opts.bookingRow,
  });
  const cancelNotify = resolveBookingNotifyTargets(
    "booking.cancelled",
    opts.cancelPolicy,
    opts.lifecycleNotificationSettings ?? null,
  );
  await opts.lifecycle.patchLatestCancellationNotifications(
    opts.appointment.id,
    opts.organizationId,
    buildBookingNotificationsSent({
      eventType: "booking.cancelled",
      idempotencyKey: `staff.cancelled:${opts.appointment.id}`,
      notifyPatient: cancelNotify.notifyPatient,
      notifyStaff: cancelNotify.notifyStaff,
      integratorStatus,
    }),
  );
}

export async function applyStaffRescheduleSideEffects(opts: {
  projection: AppointmentProjectionPort | null | undefined;
  lifecycle: LifecycleService;
  organizationId: string;
  appointment: BeAppointment;
  reschedulePolicy: ReschedulePolicy;
  syncPort?: BookingSyncPort | null;
  bookingRow?: PatientBookingRecord | null;
  lifecycleNotificationSettings?: BookingLifecycleNotificationsSettings | null;
  branches?: LegacyBranchProjectionPort | null;
}): Promise<void> {
  if (opts.projection) {
    await projectCanonicalAppointmentRescheduled(
      opts.projection,
      opts.appointment,
      await projectionFromAppointment(opts.appointment, opts.bookingRow, opts.branches),
    );
  }
  const integratorStatus = await emitStaffCanonicalBookingEvent({
    syncPort: opts.syncPort,
    eventType: "booking.rescheduled",
    appointment: opts.appointment,
    bookingRow: opts.bookingRow,
  });
  const rescheduleNotify = resolveBookingNotifyTargets(
    "booking.rescheduled",
    opts.reschedulePolicy,
    opts.lifecycleNotificationSettings ?? null,
  );
  await opts.lifecycle.patchLatestRescheduleNotifications(
    opts.appointment.id,
    opts.organizationId,
    buildBookingNotificationsSent({
      eventType: "booking.rescheduled",
      idempotencyKey: `staff.rescheduled:${opts.appointment.id}:${opts.appointment.startAt}`,
      notifyPatient: rescheduleNotify.notifyPatient,
      notifyStaff: rescheduleNotify.notifyStaff,
      integratorStatus,
    }),
  );
}
