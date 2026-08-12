export const ORGANIZATION_MEMBERSHIP_ROLES = ['owner', 'admin', 'doctor', 'assistant'] as const;
export type OrganizationMembershipRole = (typeof ORGANIZATION_MEMBERSHIP_ROLES)[number];

export const ORGANIZATION_MEMBERSHIP_STATUSES = ['active', 'invited', 'disabled'] as const;
export type OrganizationMembershipStatus = (typeof ORGANIZATION_MEMBERSHIP_STATUSES)[number];

export type OrganizationMembership = {
  id: string;
  organizationId: string;
  platformUserId: string;
  role: OrganizationMembershipRole;
  specialistId: string | null;
  status: OrganizationMembershipStatus;
  /** Personal override, owner (04.08): "отключить У СЕБЯ" — a flag on the row, not the org. */
  doctorScreensDisabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type OrganizationMemberDirectoryRecord = OrganizationMembership & {
  displayName: string | null;
};

export type OrganizationSpecialistDirectoryRecord = {
  id: string;
  organizationId: string;
  fullName: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type OrganizationMembershipPort = {
  listByPlatformUser(platformUserId: string): Promise<OrganizationMembership[]>;
  listActiveByPlatformUser(platformUserId: string): Promise<OrganizationMembership[]>;
  /** Exact pre-routing read used after human login but before an organization context exists. */
  listActiveForWorkspaceResolution(platformUserId: string): Promise<OrganizationMembership[]>;
  listByOrganization(organizationId: string): Promise<OrganizationMemberDirectoryRecord[]>;
  listPlatformDirectoryByOrganization(
    organizationId: string,
  ): Promise<OrganizationMemberDirectoryRecord[]>;
  getMemberByOrganization(params: {
    organizationId: string;
    membershipId: string;
  }): Promise<OrganizationMemberDirectoryRecord | null>;
  listSpecialistsByOrganization(
    organizationId: string,
  ): Promise<OrganizationSpecialistDirectoryRecord[]>;
  getSpecialistByOrganization(params: {
    organizationId: string;
    specialistId: string;
  }): Promise<OrganizationSpecialistDirectoryRecord | null>;
  setDoctorScreensDisabled(params: { membershipId: string; disabled: boolean }): Promise<void>;
};
