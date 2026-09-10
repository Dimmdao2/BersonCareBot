import type { ClinicSeatStatus } from '@/modules/clinic-seats/service';

export type DoctorWorkspaceComposition = 'solo' | 'clinic';

/**
 * The cabinet mode is a TARIFF PROPERTY, not a headcount. Owner ruling 2026-09-10: «число мест — не
 * показатель, админ клиники может начинать с одного себя и приглашать других; у соло механика
 * приглашений отключена в принципе». So the authority is the `clinic_team` mechanic («Режим
 * клиники»), which the platform administrator switches on the tariff — the same mechanic every
 * invite/member/seat route already gates on, so solo cannot invite anyone even by direct request.
 *
 * The single non-tariff case left is data safety, not a mode guess: an organization that still
 * holds more than one member after a downgrade keeps management reachable so those people can be
 * removed. Seat counts (`limit`) never decide the mode.
 */
export function resolveDoctorWorkspaceComposition(params: {
  clinicTeamEntitled: boolean;
  seats: ClinicSeatStatus;
}): DoctorWorkspaceComposition {
  if (params.clinicTeamEntitled) return 'clinic';
  return params.seats.used > 1 ? 'clinic' : 'solo';
}
