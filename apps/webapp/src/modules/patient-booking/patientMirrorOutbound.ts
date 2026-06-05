import type { BeAppointment } from "@/modules/booking-engine/types";
import type { AppointmentMirrorSyncService } from "@/modules/booking-appointment-sync/ports";
import type { BookingSyncPort } from "./ports";
import { logBookingRubitimeMirrorFailed } from "./bookingLifecycleObservability";

export async function mirrorPatientCancelToRubitime(opts: {
  bookingId: string;
  rubitimeId: string;
  canonicalAppointmentId: string;
  appointmentMirrorSync?: AppointmentMirrorSyncService | null;
  syncPort: BookingSyncPort;
}): Promise<"ok" | "failed" | "skipped"> {
  if (!opts.rubitimeId.trim()) return "skipped";
  try {
    if (opts.appointmentMirrorSync) {
      await opts.appointmentMirrorSync.pushCancelToRubitime(opts.rubitimeId);
      await opts.appointmentMirrorSync.stampCanonicalOutbound(opts.canonicalAppointmentId);
    } else if (opts.syncPort.cancelRecord) {
      await opts.syncPort.cancelRecord(opts.rubitimeId);
    } else {
      return "skipped";
    }
    return "ok";
  } catch {
    logBookingRubitimeMirrorFailed({
      bookingId: opts.bookingId,
      action: "cancel_record",
      rubitimeId: opts.rubitimeId,
    });
    return "failed";
  }
}

export async function mirrorPatientRescheduleToRubitime(opts: {
  bookingId: string;
  rubitimeId: string;
  canonicalAppointmentId: string;
  appointment: Pick<BeAppointment, "startAt" | "endAt" | "branchId" | "specialistId" | "serviceId" | "status">;
  appointmentMirrorSync?: AppointmentMirrorSyncService | null;
  syncPort: BookingSyncPort;
}): Promise<"ok" | "failed" | "skipped"> {
  if (!opts.rubitimeId.trim()) return "skipped";
  try {
    if (opts.appointmentMirrorSync) {
      await opts.appointmentMirrorSync.pushRescheduleToRubitime(
        opts.appointment as BeAppointment,
        opts.rubitimeId,
      );
      await opts.appointmentMirrorSync.stampCanonicalOutbound(opts.canonicalAppointmentId);
    } else if (opts.syncPort.updateRecord) {
      await opts.syncPort.updateRecord({
        rubitimeId: opts.rubitimeId,
        slotStart: opts.appointment.startAt,
        slotEnd: opts.appointment.endAt,
      });
    } else {
      return "skipped";
    }
    return "ok";
  } catch {
    logBookingRubitimeMirrorFailed({
      bookingId: opts.bookingId,
      action: "update_record",
      rubitimeId: opts.rubitimeId,
    });
    return "failed";
  }
}
