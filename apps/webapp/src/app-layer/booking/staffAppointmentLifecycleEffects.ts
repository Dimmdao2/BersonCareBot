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
  projectCanonicalAppointmentNoShow,
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
  /** R21: врач снял галочку «Уведомлять пациента» — подавить уведомление пациенту. */
  suppressPatientNotification?: boolean;
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
    suppressPatientNotification: opts.suppressPatientNotification === true,
  });
  const resolvedCancelNotify = resolveBookingNotifyTargets(
    "booking.cancelled",
    opts.cancelPolicy,
    opts.lifecycleNotificationSettings ?? null,
  );
  const cancelNotify = opts.suppressPatientNotification
    ? { ...resolvedCancelNotify, notifyPatient: false }
    : resolvedCancelNotify;
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

/**
 * Side effects after staff marks a canonical appointment as no-show:
 * - update projection record (status → "canceled", last_event = "native.no_show")
 * - emit booking.cancelled integrator event (no-show is a variant of appointment end without visit)
 * - resolve + record notificationsSent with same suppression mechanism as staff-cancel (R21 pattern)
 */
export async function applyStaffNoShowSideEffects(opts: {
  projection: AppointmentProjectionPort | null | undefined;
  lifecycle: LifecycleService;
  organizationId: string;
  appointment: BeAppointment;
  syncPort?: BookingSyncPort | null;
  bookingRow?: PatientBookingRecord | null;
  lifecycleNotificationSettings?: BookingLifecycleNotificationsSettings | null;
  branches?: LegacyBranchProjectionPort | null;
  /** Suppress patient notification — same flag/mechanism as staff-cancel R21 suppression. */
  suppressPatientNotification?: boolean;
}): Promise<void> {
  if (opts.projection) {
    await projectCanonicalAppointmentNoShow(
      opts.projection,
      opts.appointment,
      await projectionFromAppointment(opts.appointment, opts.bookingRow, opts.branches),
    );
  }
  // Reuse booking.cancelled integrator event (no-show is a variant of appointment end without visit).
  // suppressPatientNotification travels exactly as in the staff-cancel path (R21).
  const integratorStatus = await emitStaffCanonicalBookingEvent({
    syncPort: opts.syncPort,
    eventType: "booking.cancelled",
    appointment: opts.appointment,
    bookingRow: opts.bookingRow,
    suppressPatientNotification: opts.suppressPatientNotification === true,
  });
  // Use booking.cancelled policy for notification targets (no separate no-show policy exists yet).
  const noShowNotifyRaw = resolveBookingNotifyTargets(
    "booking.cancelled",
    // Default: notify patient on no-show unless suppressed.
    { notifyPatient: true, notifyStaff: true },
    opts.lifecycleNotificationSettings ?? null,
  );
  const noShowNotify = opts.suppressPatientNotification
    ? { ...noShowNotifyRaw, notifyPatient: false }
    : noShowNotifyRaw;
  await opts.lifecycle.patchLatestNoShowNotifications(
    opts.appointment.id,
    opts.organizationId,
    buildBookingNotificationsSent({
      eventType: "booking.cancelled",
      idempotencyKey: `staff.no_show:${opts.appointment.id}`,
      notifyPatient: noShowNotify.notifyPatient,
      notifyStaff: noShowNotify.notifyStaff,
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
