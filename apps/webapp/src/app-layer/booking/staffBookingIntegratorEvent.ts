import type { BeAppointment } from "@/modules/booking-engine/types";
import type { BookingSyncPort } from "@/modules/patient-booking/ports";
import type { PatientBookingRecord } from "@/modules/patient-booking/types";

type StaffBookingEventType = "booking.created" | "booking.cancelled" | "booking.rescheduled";

export function staffBookingContactNameFromAppointment(appt: BeAppointment): string {
  const attr = appt.attributionJson ?? {};
  const name =
    typeof attr.contact_name === "string"
      ? attr.contact_name
      : typeof attr.contactName === "string"
        ? attr.contactName
        : null;
  return name?.trim() || "Пациент";
}

export function staffBookingServiceTitleFromAppointment(
  appt: BeAppointment,
  bookingRow?: PatientBookingRecord | null,
): string | null {
  if (bookingRow?.serviceTitleSnapshot) return bookingRow.serviceTitleSnapshot;
  const attr = appt.attributionJson ?? {};
  const title =
    typeof attr.service_title === "string"
      ? attr.service_title
      : typeof attr.serviceTitle === "string"
        ? attr.serviceTitle
        : null;
  return title?.trim() || null;
}

export async function emitStaffCanonicalBookingEvent(opts: {
  syncPort: BookingSyncPort | null | undefined;
  eventType: StaffBookingEventType;
  appointment: BeAppointment;
  bookingRow?: PatientBookingRecord | null;
  /** R21: пробросить подавление пациентского уведомления в интегратор (cancel/no-show-путь). */
  suppressPatientNotification?: boolean;
}): Promise<"sent" | "skipped"> {
  // R21: if suppression is active, skip the integrator event entirely (patient notification).
  if (opts.suppressPatientNotification) return "skipped";
  if (!opts.syncPort) return "skipped";
  const bookingRow = opts.bookingRow ?? null;
  const bookingId = bookingRow?.id ?? opts.appointment.id;
  const userId = bookingRow?.userId ?? opts.appointment.platformUserId ?? opts.appointment.id;
  const contactName = bookingRow?.contactName ?? staffBookingContactNameFromAppointment(opts.appointment);
  const contactPhone = bookingRow?.contactPhone ?? opts.appointment.phoneNormalized ?? "+70000000000";
  try {
    await opts.syncPort.emitBookingEvent({
      eventType: opts.eventType,
      idempotencyKey: `staff.${opts.eventType}:${opts.appointment.id}:${opts.appointment.startAt}`,
      payload: {
        bookingId,
        userId,
        rubitimeId: bookingRow?.rubitimeId ?? null,
        bookingType: bookingRow?.bookingType ?? "in_person",
        city: bookingRow?.city ?? undefined,
        category: bookingRow?.category ?? "general",
        slotStart: opts.appointment.startAt,
        slotEnd: opts.appointment.endAt,
        contactName,
        contactPhone,
        contactEmail: bookingRow?.contactEmail ?? undefined,
        branchServiceId: bookingRow?.branchServiceId ?? null,
        cityCodeSnapshot: bookingRow?.cityCodeSnapshot ?? null,
        serviceTitleSnapshot: staffBookingServiceTitleFromAppointment(opts.appointment, bookingRow),
        canonicalAppointmentId: opts.appointment.id,
        ...(opts.suppressPatientNotification ? { suppressPatientNotification: true } : {}),
      },
    });
    return "sent";
  } catch {
    return "skipped";
  }
}
