import type { BeAppointment } from '@/modules/booking-engine/types';
import type { DoctorBookingEngineContext } from './_requireDoctorBookingEngine';

export type DoctorAppointmentAccessMode = 'own' | 'clinic';

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
