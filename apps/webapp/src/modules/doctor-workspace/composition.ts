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
  // A team-capable workspace must keep its management surface before a second
  // member exists. Retained active members/invites (`used`) keep it available
  // after a downgrade, including legacy organizations without a configured cap.
  if (params.clinicTeamEntitled || params.seats.used > 1) return 'clinic';
  if (params.seats.configured && params.seats.limit > 1) return 'clinic';
  return 'solo';
}
