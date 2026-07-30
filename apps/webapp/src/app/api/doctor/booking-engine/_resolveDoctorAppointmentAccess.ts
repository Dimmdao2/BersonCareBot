import type { BeAppointment } from '@/modules/booking-engine/types';
import type { DoctorBookingEngineContext } from './_requireDoctorBookingEngine';
import { resolveDoctorScheduleScope } from './_resolveDoctorScheduleScope';

export type DoctorAppointmentAccessMode = 'own' | 'clinic';

export type DoctorCreateSpecialistResolution =
  | { ok: true; specialistId: string }
  | {
      ok: false;
      error: 'schedule_specialist_not_configured' | 'schedule_specialist_not_available';
    };

/**
 * Resolves a direct appointment ID against the authenticated organization and
 * specialist capability. A null result is intentionally neutral for route 404s.
 */
export async function resolveDoctorAppointmentAccess(
  ctx: DoctorBookingEngineContext,
  appointmentId: string,
  mode: DoctorAppointmentAccessMode,
): Promise<BeAppointment | null> {
  const appointment = await ctx.service.getAppointment(appointmentId);
  if (!appointment || appointment.organizationId !== ctx.organizationId) return null;
  if (ctx.specialistId && appointment.specialistId === ctx.specialistId) return appointment;
  if (mode === 'clinic' && ctx.canManageAllSpecialists) return appointment;
  return null;
}

/** Resolves a concrete create target without trusting a client-supplied specialist ID. */
export async function resolveDoctorCreateSpecialist(
  ctx: DoctorBookingEngineContext,
  requestedSpecialistId: string | null | undefined,
): Promise<DoctorCreateSpecialistResolution> {
  const resolution = await resolveDoctorScheduleScope(
    ctx,
    requestedSpecialistId
      ? { scope: 'specialist', specialistId: requestedSpecialistId }
      : { scope: 'mine' },
  );
  if (!resolution.ok) return resolution;
  if (!resolution.value.specialistId) {
    return { ok: false, error: 'schedule_specialist_not_configured' };
  }
  return { ok: true, specialistId: resolution.value.specialistId };
}
