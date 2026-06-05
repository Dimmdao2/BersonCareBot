import type { BeAppointment } from "@/modules/booking-engine/types";
import type { AppointmentMirrorSyncService } from "@/modules/booking-appointment-sync/ports";
import type { BookingSyncPort } from "@/modules/patient-booking/ports";
import type { PatientBookingRecord } from "@/modules/patient-booking/types";

export async function resolveRubitimeIdForAppointment(opts: {
  appointmentId: string;
  organizationId: string;
  bookingRow?: PatientBookingRecord | null;
  getRubitimeAppointmentId?: (input: {
    organizationId: string;
    appointmentId: string;
  }) => Promise<string | null>;
}): Promise<string | null> {
  const fromBooking = opts.bookingRow?.rubitimeId?.trim();
  if (fromBooking) return fromBooking;
  if (!opts.getRubitimeAppointmentId) return null;
  return opts.getRubitimeAppointmentId({
    organizationId: opts.organizationId,
    appointmentId: opts.appointmentId,
  });
}

export async function syncStaffCancelToRubitime(opts: {
  rubitimeId: string;
  appointmentId: string;
  appointmentMirrorSync?: AppointmentMirrorSyncService | null;
  syncPort?: BookingSyncPort | null;
}): Promise<void> {
  if (opts.appointmentMirrorSync) {
    await opts.appointmentMirrorSync.pushCancelToRubitime(opts.rubitimeId);
    await opts.appointmentMirrorSync.stampCanonicalOutbound(opts.appointmentId);
    return;
  }
  if (opts.syncPort?.cancelRecord) {
    await opts.syncPort.cancelRecord(opts.rubitimeId);
  }
}

export async function syncStaffRescheduleToRubitime(opts: {
  rubitimeId: string;
  appointmentId: string;
  appointment: BeAppointment;
  appointmentMirrorSync?: AppointmentMirrorSyncService | null;
  syncPort?: BookingSyncPort | null;
}): Promise<void> {
  if (opts.appointmentMirrorSync) {
    await opts.appointmentMirrorSync.pushRescheduleToRubitime(opts.appointment, opts.rubitimeId);
    await opts.appointmentMirrorSync.stampCanonicalOutbound(opts.appointmentId);
    return;
  }
  if (opts.syncPort?.updateRecord) {
    await opts.syncPort.updateRecord({
      rubitimeId: opts.rubitimeId,
      slotStart: opts.appointment.startAt,
      slotEnd: opts.appointment.endAt,
    });
  }
}
