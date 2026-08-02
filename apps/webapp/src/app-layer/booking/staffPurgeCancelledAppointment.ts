import { emitBookingDeletedEvent } from '@/app-layer/booking/emitBookingDeletedEvent';
import type { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { isStaffDeletableCancelledStatus } from '@/modules/booking-calendar/appointmentStatusLabels';
import { nativeIntegratorRecordId } from '@/modules/patient-booking/projectCanonicalAppointment';

export type StaffPurgeCancelledAppointmentResult =
  | { ok: true }
  | { ok: false; error: 'not_found' | 'not_cancelled' };

export async function staffPurgeCancelledAppointment(input: {
  deps: ReturnType<typeof buildAppDeps>;
  organizationId: string;
  appointmentId: string;
  actorId: string;
  runLocalPurge?: <T>(fn: () => Promise<T>) => Promise<T>;
}): Promise<StaffPurgeCancelledAppointmentResult> {
  if (!input.deps.bookingEngine || !input.deps.appointmentProjection) {
    return { ok: false, error: 'not_found' };
  }

  const appointment = await input.deps.bookingEngine.getAppointment(input.appointmentId);
  if (!appointment || appointment.organizationId !== input.organizationId) {
    return { ok: false, error: 'not_found' };
  }
  if (!isStaffDeletableCancelledStatus(appointment.status)) {
    return { ok: false, error: 'not_cancelled' };
  }

  const purge = () =>
    input.deps.appointmentProjection!.softDeleteByCanonicalAppointmentId(
      input.appointmentId,
      appointment.organizationId,
    );
  const purged = input.runLocalPurge ? await input.runLocalPurge(purge) : await purge();
  if (!purged) {
    return { ok: false, error: 'not_found' };
  }

  const integratorRecordId = nativeIntegratorRecordId(input.appointmentId);
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

  return { ok: true };
}
