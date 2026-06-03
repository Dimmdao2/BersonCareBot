import type { BeAppointment } from "@/modules/booking-engine/types";
import type { BookingSyncPort } from "@/modules/patient-booking/ports";
import type { PatientBookingRecord } from "@/modules/patient-booking/types";
import {
  emitStaffCanonicalBookingEvent,
  staffBookingContactNameFromAppointment,
  staffBookingServiceTitleFromAppointment,
} from "./staffBookingIntegratorEvent";

export async function emitPackageCalendarSync(opts: {
  syncPort: BookingSyncPort | null | undefined;
  appointment: BeAppointment;
  bookingRow?: PatientBookingRecord | null;
  eventType: "booking.package_linked" | "booking.package_unlinked";
}): Promise<"sent" | "skipped"> {
  if (!opts.syncPort) return "skipped";
  const bookingRow = opts.bookingRow ?? null;
  const bookingId = bookingRow?.id ?? opts.appointment.id;
  const userId = bookingRow?.userId ?? opts.appointment.platformUserId ?? opts.appointment.id;
  const contactName =
    bookingRow?.contactName ?? staffBookingContactNameFromAppointment(opts.appointment);
  const contactPhone = bookingRow?.contactPhone ?? opts.appointment.phoneNormalized ?? "+70000000000";
  try {
    await opts.syncPort.emitBookingEvent({
      eventType: opts.eventType,
      idempotencyKey: `staff.${opts.eventType}:${opts.appointment.id}:${Date.now()}`,
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
      },
    });
    return "sent";
  } catch {
    return "skipped";
  }
}

export async function emitPackageLinkedCalendarSync(
  syncPort: BookingSyncPort | null | undefined,
  appointment: BeAppointment,
  bookingRow?: PatientBookingRecord | null,
): Promise<"sent" | "skipped"> {
  return emitPackageCalendarSync({
    syncPort,
    appointment,
    bookingRow,
    eventType: "booking.package_linked",
  });
}

/** After consume/penalty ref change — refresh GCal ✅ and session line (best-effort). */
export async function syncPackageCalendarAfterUsageChange(opts: {
  appointmentId: string;
  bookingEngine: { getAppointment(id: string): Promise<BeAppointment | null> };
  resolveBookingRow?: (canonicalAppointmentId: string) => Promise<PatientBookingRecord | null>;
  syncPort?: BookingSyncPort | null;
}): Promise<void> {
  const appt = await opts.bookingEngine.getAppointment(opts.appointmentId);
  if (!appt) return;
  const { createBookingSyncPort } = await import("@/modules/integrator/bookingM2mApi");
  const syncPort = opts.syncPort ?? createBookingSyncPort();
  const bookingRow = opts.resolveBookingRow
    ? await opts.resolveBookingRow(opts.appointmentId).catch(() => null)
    : null;
  await emitPackageLinkedCalendarSync(syncPort, appt, bookingRow);
}

export { emitStaffCanonicalBookingEvent };
