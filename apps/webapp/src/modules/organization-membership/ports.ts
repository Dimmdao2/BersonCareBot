export const ORGANIZATION_MEMBERSHIP_ROLES = ["owner", "admin", "doctor", "assistant"] as const;
export type OrganizationMembershipRole = (typeof ORGANIZATION_MEMBERSHIP_ROLES)[number];

export const ORGANIZATION_MEMBERSHIP_STATUSES = ["active", "invited", "disabled"] as const;
export type OrganizationMembershipStatus = (typeof ORGANIZATION_MEMBERSHIP_STATUSES)[number];

export type OrganizationMembership = {
  id: string;
  organizationId: string;
  platformUserId: string;
  role: OrganizationMembershipRole;
  specialistId: string | null;
  status: OrganizationMembershipStatus;
  createdAt: string;
  updatedAt: string;
};

export type OrganizationMembershipPort = {
  listByPlatformUser(platformUserId: string): Promise<OrganizationMembership[]>;
  listActiveByPlatformUser(platformUserId: string): Promise<OrganizationMembership[]>;
};
