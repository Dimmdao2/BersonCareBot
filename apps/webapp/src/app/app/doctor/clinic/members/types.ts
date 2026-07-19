import type {
  OrganizationMembershipRole,
  OrganizationMembershipStatus,
} from "@/modules/organization-membership/ports";
import type {
  OrganizationInviteRole,
  OrganizationInviteStatus,
} from "@/modules/organization-invites/ports";

export type ClinicMemberView = {
  id: string;
  displayName: string | null;
  role: OrganizationMembershipRole;
  status: OrganizationMembershipStatus;
  canManageOrganization: boolean;
  specialistLinked: boolean;
};

export type ClinicInviteView = {
  id: string;
  invitedEmail: string;
  invitedRole: OrganizationInviteRole;
  status: OrganizationInviteStatus;
  expiresAt: string;
};
