import type { OrganizationMembershipRole } from "@/modules/organization-membership/ports";

export type DoctorWorkspaceContext = {
  organizationId: string;
  organizationName: string | null;
  membershipId: string;
  membershipRole: OrganizationMembershipRole;
  specialistId: string | null;
  canManageOrganization: boolean;
  canManageAllSpecialists: boolean;
  selectedSpecialistId: string | null;
};
