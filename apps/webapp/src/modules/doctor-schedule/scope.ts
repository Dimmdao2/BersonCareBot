export type DoctorScheduleScopeMode = 'mine' | 'clinic' | 'specialist';

export type DoctorScheduleScopeInput = {
  scope?: DoctorScheduleScopeMode | null;
  specialistId?: string | null;
};

export type DoctorScheduleSpecialistOption = {
  id: string;
  displayLabel: string;
};

export type ResolvedDoctorScheduleScope = {
  scope: DoctorScheduleScopeMode;
  specialistId: string | null;
  ownSpecialistId: string | null;
  canManageAllSpecialists: boolean;
  specialists: DoctorScheduleSpecialistOption[];
};

export type DoctorScheduleScopeBootstrap = Pick<
  ResolvedDoctorScheduleScope,
  'ownSpecialistId' | 'canManageAllSpecialists' | 'specialists'
>;

export type DoctorScheduleScopeState = Pick<ResolvedDoctorScheduleScope, 'scope' | 'specialistId'>;

export function resolveActiveOwnSpecialistId(
  ownSpecialistId: string | null,
  activeSpecialists: readonly { id: string }[],
): string | null {
  if (!ownSpecialistId) return null;
  return activeSpecialists.some((specialist) => specialist.id === ownSpecialistId)
    ? ownSpecialistId
    : null;
}

export function canUseOwnSpecialistAppointmentActions(
  ownSpecialistId: string | null,
  appointmentSpecialistId: string | null,
): boolean {
  return ownSpecialistId !== null && appointmentSpecialistId === ownSpecialistId;
}

export function resolveDoctorScheduleScopeState(
  bootstrap: DoctorScheduleScopeBootstrap,
  rawScope: string | null | undefined,
  rawSpecialistId: string | null | undefined,
): DoctorScheduleScopeState {
  if (!bootstrap.canManageAllSpecialists) {
    return { scope: 'mine', specialistId: bootstrap.ownSpecialistId };
  }

  if (rawScope === 'clinic') {
    return { scope: 'clinic', specialistId: null };
  }
  if (rawScope === 'mine' && bootstrap.ownSpecialistId) {
    return { scope: 'mine', specialistId: bootstrap.ownSpecialistId };
  }
  if (
    rawScope === 'specialist' &&
    rawSpecialistId &&
    bootstrap.specialists.some((specialist) => specialist.id === rawSpecialistId)
  ) {
    return { scope: 'specialist', specialistId: rawSpecialistId };
  }

  return bootstrap.ownSpecialistId
    ? { scope: 'mine', specialistId: bootstrap.ownSpecialistId }
    : { scope: 'clinic', specialistId: null };
}

export function doctorScheduleScopeQuery(state: DoctorScheduleScopeState): {
  scope: DoctorScheduleScopeMode;
  specialistId?: string;
} {
  return state.scope === 'specialist' && state.specialistId
    ? { scope: state.scope, specialistId: state.specialistId }
    : { scope: state.scope };
}
