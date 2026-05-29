import type { createBookingAppointmentLifecycleService } from "@/modules/booking-appointment-lifecycle/service";
import type { CancellationPolicy, ReschedulePolicy } from "@/modules/booking-policies/types";
import type { BeAppointment } from "@/modules/booking-engine/types";
import { buildBookingNotificationsSent } from "@/modules/patient-booking/bookingLifecycleNotifications";
import type { AppointmentProjectionPort, BookingSyncPort } from "@/modules/patient-booking/ports";
import type { PatientBookingRecord } from "@/modules/patient-booking/types";
import { emitStaffCanonicalBookingEvent } from "@/app-layer/booking/staffBookingIntegratorEvent";
import {
  projectCanonicalAppointmentCancelled,
  projectCanonicalAppointmentRescheduled,
} from "@/modules/patient-booking/projectCanonicalAppointment";

type LifecycleService = ReturnType<typeof createBookingAppointmentLifecycleService>;

function projectionFromAppointment(appt: BeAppointment) {
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
  return {
    phoneNormalized: appt.phoneNormalized,
    contactName,
    serviceTitle,
    branchTitle: null,
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
}): Promise<void> {
  if (opts.projection) {
    await projectCanonicalAppointmentCancelled(
      opts.projection,
      opts.appointment,
      projectionFromAppointment(opts.appointment),
    );
  }
  const integratorStatus = await emitStaffCanonicalBookingEvent({
    syncPort: opts.syncPort,
    eventType: "booking.cancelled",
    appointment: opts.appointment,
    bookingRow: opts.bookingRow,
  });
  await opts.lifecycle.patchLatestCancellationNotifications(
    opts.appointment.id,
    opts.organizationId,
    buildBookingNotificationsSent({
      eventType: "booking.cancelled",
      idempotencyKey: `staff.cancelled:${opts.appointment.id}`,
      notifyPatient: opts.cancelPolicy.notifyPatient,
      notifyStaff: opts.cancelPolicy.notifyStaff,
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
}): Promise<void> {
  if (opts.projection) {
    await projectCanonicalAppointmentRescheduled(
      opts.projection,
      opts.appointment,
      projectionFromAppointment(opts.appointment),
    );
  }
  const integratorStatus = await emitStaffCanonicalBookingEvent({
    syncPort: opts.syncPort,
    eventType: "booking.rescheduled",
    appointment: opts.appointment,
    bookingRow: opts.bookingRow,
  });
  await opts.lifecycle.patchLatestRescheduleNotifications(
    opts.appointment.id,
    opts.organizationId,
    buildBookingNotificationsSent({
      eventType: "booking.rescheduled",
      idempotencyKey: `staff.rescheduled:${opts.appointment.id}:${opts.appointment.startAt}`,
      notifyPatient: opts.reschedulePolicy.notifyPatient,
      notifyStaff: opts.reschedulePolicy.notifyStaff,
      integratorStatus,
    }),
  );
}
