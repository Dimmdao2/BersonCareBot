export const DEV_CLINIC_ADMIN_ORGANIZATION_ID = 'd0000000-0000-4000-8000-000000000004';
export const DEV_CLINIC_ADMIN_SPECIALIST_ID = 'd0000000-0000-4000-8000-000000000005';
export const DEV_DOCTOR_SPECIALIST_ID = 'd0000000-0000-4000-8000-000000000006';

export type DevBypassStaffWorkspaceKind = 'doctor' | 'clinic_admin' | 'global_admin';

export type DevBypassStaffWorkspaceState = {
  organization: {
    id: string;
    title: string;
    isActive: boolean;
    sortOrder: number;
  };
  specialist: {
    id: string;
    organizationId: string;
    fullName: string;
    isActive: boolean;
    sortOrder: number;
  } | null;
  membership: {
    organizationId: string;
    platformUserId: string;
    role: 'owner' | 'doctor' | 'assistant';
    specialistId: string | null;
    status: 'active';
  };
};

/** Pure desired-state projection used by the idempotent DEV reconciliation adapter. */
export function reconcileDevBypassStaffWorkspace(input: {
  platformUserId: string;
  displayName: string;
  kind: DevBypassStaffWorkspaceKind;
}): DevBypassStaffWorkspaceState {
  const staff = (() => {
    switch (input.kind) {
      case 'clinic_admin':
        return {
          role: 'owner' as const,
          specialistId: DEV_CLINIC_ADMIN_SPECIALIST_ID,
          specialistSortOrder: 0,
        };
      case 'doctor':
        return {
          role: 'doctor' as const,
          specialistId: DEV_DOCTOR_SPECIALIST_ID,
          specialistSortOrder: 1,
        };
      case 'global_admin':
        return {
          role: 'assistant' as const,
          specialistId: null,
          specialistSortOrder: null,
        };
    }
  })();

  return {
    organization: {
      id: DEV_CLINIC_ADMIN_ORGANIZATION_ID,
      title: 'DEV Demo Clinic',
      isActive: true,
      sortOrder: 0,
    },
    specialist:
      staff.specialistId === null || staff.specialistSortOrder === null
        ? null
        : {
            id: staff.specialistId,
            organizationId: DEV_CLINIC_ADMIN_ORGANIZATION_ID,
            fullName: input.displayName,
            isActive: true,
            sortOrder: staff.specialistSortOrder,
          },
    membership: {
      organizationId: DEV_CLINIC_ADMIN_ORGANIZATION_ID,
      platformUserId: input.platformUserId,
      role: staff.role,
      specialistId: staff.specialistId,
      status: 'active',
    },
  };
}
