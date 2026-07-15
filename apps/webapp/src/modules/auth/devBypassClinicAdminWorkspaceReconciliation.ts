export const DEV_CLINIC_ADMIN_ORGANIZATION_ID = "d0000000-0000-4000-8000-000000000004";
export const DEV_CLINIC_ADMIN_SPECIALIST_ID = "d0000000-0000-4000-8000-000000000005";

export type DevClinicAdminWorkspaceState = {
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
  };
  membership: {
    organizationId: string;
    platformUserId: string;
    role: "owner";
    specialistId: string;
    status: "active";
  };
};

/** Pure desired-state projection used by the idempotent DEV reconciliation adapter. */
export function reconcileDevClinicAdminWorkspace(input: {
  platformUserId: string;
  displayName: string;
}): DevClinicAdminWorkspaceState {
  return {
    organization: {
      id: DEV_CLINIC_ADMIN_ORGANIZATION_ID,
      title: "DEV UX Clinic",
      isActive: true,
      sortOrder: 0,
    },
    specialist: {
      id: DEV_CLINIC_ADMIN_SPECIALIST_ID,
      organizationId: DEV_CLINIC_ADMIN_ORGANIZATION_ID,
      fullName: input.displayName,
      isActive: true,
      sortOrder: 0,
    },
    membership: {
      organizationId: DEV_CLINIC_ADMIN_ORGANIZATION_ID,
      platformUserId: input.platformUserId,
      role: "owner",
      specialistId: DEV_CLINIC_ADMIN_SPECIALIST_ID,
      status: "active",
    },
  };
}
