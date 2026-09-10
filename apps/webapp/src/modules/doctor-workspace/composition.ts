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
  // A configured tariff is authoritative: one specialist place is the solo product,
  // while a tariff that actually includes multiple places opens clinic management.
  // Retained extra members keep management reachable after a downgrade so they can be removed.
  if (params.seats.configured) {
    return params.seats.limit > 1 || params.seats.used > 1 ? 'clinic' : 'solo';
  }
  // Compatibility organizations without a configured seat quota retain the former
  // entitlement-based projection until their tariff is configured explicitly.
  return params.clinicTeamEntitled || params.seats.used > 1 ? 'clinic' : 'solo';
}
