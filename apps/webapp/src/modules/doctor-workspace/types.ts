import type {
  OrganizationMembershipRole,
  OrganizationMembershipStatus,
} from '@/modules/organization-membership/ports';

export type DoctorWorkspaceContext = {
  organizationId: string;
  organizationName: string | null;
  membershipId: string;
  membershipRole: OrganizationMembershipRole;
  specialistId: string | null;
  canManageOrganization: boolean;
  canManageAllSpecialists: boolean;
  canAccessClinicalWorkspace?: boolean;
  doctorScreensDisabled: boolean;
  selectedSpecialistId: string | null;
};

export type DoctorWorkspaceSpecialist = {
  id: string;
  fullName: string;
  isActive: boolean;
  isCurrentUserSpecialist: boolean;
};

export type DoctorWorkspaceMember = {
  membershipId: string;
  platformUserId: string;
  role: OrganizationMembershipRole;
  specialistId: string | null;
  status: OrganizationMembershipStatus;
  displayName: string | null;
};

export type DoctorWorkspaceDirectory = {
  specialists: DoctorWorkspaceSpecialist[];
  members: DoctorWorkspaceMember[];
};
