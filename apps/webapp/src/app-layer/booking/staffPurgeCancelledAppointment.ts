import { emitBookingDeletedEvent } from "@/app-layer/booking/emitBookingDeletedEvent";
import { isStaffRubitimeOutboundEnabled } from "@/app-layer/booking/staffRubitimeBridgePolicy";
import { resolveRubitimeIdForAppointment } from "@/app-layer/booking/staffRubitimeMirrorOutbound";
import type { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { isStaffDeletableCancelledStatus } from "@/modules/booking-calendar/appointmentStatusLabels";
import { createBookingSyncPort } from "@/modules/integrator/bookingM2mApi";
import { resolveDoctorProjectionIntegratorRecordId } from "@/modules/patient-booking/projectCanonicalAppointment";

export type StaffPurgeCancelledAppointmentResult =
  | { ok: true; rubitimeMirrorFailed?: true }
  | { ok: false; error: "not_found" | "not_cancelled" };

export async function staffPurgeCancelledAppointment(input: {
  deps: ReturnType<typeof buildAppDeps>;
  organizationId: string;
  appointmentId: string;
  actorId: string;
  getRubitimeAppointmentId?: (params: {
    organizationId: string;
    appointmentId: string;
  }) => Promise<string | null>;
}): Promise<StaffPurgeCancelledAppointmentResult> {
  if (!input.deps.bookingEngine || !input.deps.appointmentProjection) {
    return { ok: false, error: "not_found" };
  }

  const appointment = await input.deps.bookingEngine.getAppointment(input.appointmentId);
  if (!appointment || appointment.organizationId !== input.organizationId) {
    return { ok: false, error: "not_found" };
  }
  if (!isStaffDeletableCancelledStatus(appointment.status)) {
    return { ok: false, error: "not_cancelled" };
  }

  const bookingRow = input.deps.patientBooking
    ? await input.deps.patientBooking.getBookingByCanonicalAppointment(input.appointmentId)
    : null;
  const rubitimeId = await resolveRubitimeIdForAppointment({
    appointmentId: input.appointmentId,
    organizationId: input.organizationId,
    bookingRow,
    getRubitimeAppointmentId: input.getRubitimeAppointmentId,
  });

  const purged = await input.deps.appointmentProjection.softDeleteByCanonicalAppointmentId(
    input.appointmentId,
    rubitimeId,
  );
  if (!purged) {
    return { ok: false, error: "not_found" };
  }

  let rubitimeMirrorFailed: true | undefined;
  const bridgeEnabled = await isStaffRubitimeOutboundEnabled(input.deps);
  if (rubitimeId && bridgeEnabled) {
    try {
      const syncPort = createBookingSyncPort();
      await syncPort.deleteRecord(rubitimeId);
    } catch {
      rubitimeMirrorFailed = true;
    }
  }

  const integratorRecordId = resolveDoctorProjectionIntegratorRecordId(
    input.appointmentId,
    rubitimeId,
  );
  try {
    await emitBookingDeletedEvent({
      deps: input.deps,
      integratorRecordId,
      idempotencySuffix: input.appointmentId,
      slotIsoFallback: appointment.startAt,
    });
  } catch {
    // GCal cleanup is best-effort after local purge.
  }

  return rubitimeMirrorFailed ? { ok: true, rubitimeMirrorFailed } : { ok: true };
}
