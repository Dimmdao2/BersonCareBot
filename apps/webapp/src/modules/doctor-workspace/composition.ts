import type { ClinicSeatStatus } from '@/modules/clinic-seats/service';

export type DoctorWorkspaceComposition = 'solo' | 'clinic';

/**
 * One conservative composition projection. A retained member or invite keeps management visible
 * after a downgrade; entitlement only blocks adding seats, never hides the existing team.
 */
export function resolveDoctorWorkspaceComposition(params: {
  clinicTeamEntitled: boolean;
  seats: ClinicSeatStatus;
}): DoctorWorkspaceComposition {
  if (!params.seats.configured) return params.seats.used > 1 ? 'clinic' : 'solo';
  if (!params.clinicTeamEntitled) return params.seats.used > 1 ? 'clinic' : 'solo';
  return params.seats.limit > 1 || params.seats.used > 1 ? 'clinic' : 'solo';
}
