import type {
  OrganizationMemberDirectoryRecord,
  OrganizationMembership,
  OrganizationMembershipPort,
  OrganizationMembershipRole,
} from "./ports";

export type ResolveOrganizationForUserInput = {
  platformUserId: string;
};

export type OrganizationMembershipContext = {
  membershipId: string;
  organizationId: string;
  platformUserId: string;
  role: OrganizationMembershipRole;
  specialistId: string | null;
  canManageOrganization: boolean;
  canManageAllSpecialists: boolean;
  canAccessClinicalWorkspace?: boolean;
};

export type OrganizationResolution =
  | { ok: true; context: OrganizationMembershipContext }
  | { ok: false; reason: "no_active_membership" };

function canManageOrganization(role: OrganizationMembershipRole): boolean {
  return role === "owner" || role === "admin";
}

function canAccessClinicalWorkspace(membership: OrganizationMembership): boolean {
  return (membership.role === "owner" || membership.role === "doctor") && membership.specialistId !== null;
}

function toMembershipContext(membership: OrganizationMembership): OrganizationMembershipContext {
  const canManage = canManageOrganization(membership.role);
  return {
    membershipId: membership.id,
    organizationId: membership.organizationId,
    platformUserId: membership.platformUserId,
    role: membership.role,
    specialistId: membership.specialistId,
    canManageOrganization: canManage,
    canManageAllSpecialists: canManage,
    canAccessClinicalWorkspace: canAccessClinicalWorkspace(membership),
  };
}

export function createOrganizationMembershipService(deps: {
  membershipPort: OrganizationMembershipPort;
}) {
  return {
    async resolveOrganizationForUser(input: ResolveOrganizationForUserInput): Promise<OrganizationResolution> {
      const memberships = await deps.membershipPort.listActiveByPlatformUser(input.platformUserId);
      if (memberships.length === 0) {
        return { ok: false, reason: "no_active_membership" };
      }

      if (memberships.length > 1) {
        throw new Error("multiple_active_staff_memberships");
      }

      return { ok: true, context: toMembershipContext(memberships[0]) };
    },

    async listOrganizationMembers(organizationId: string): Promise<OrganizationMemberDirectoryRecord[]> {
      const members = await deps.membershipPort.listByOrganization(organizationId);
      // The team surface is a projection of current organization people; disabled
      // historical rows do not belong alongside pending invites.
      return members.filter((member) => member.status === "active");
    },

    async listPlatformOrganizationMembers(
      organizationId: string,
    ): Promise<OrganizationMemberDirectoryRecord[]> {
      return deps.membershipPort.listPlatformDirectoryByOrganization(organizationId);
    },

    async hasActiveMembership(platformUserId: string, organizationId: string): Promise<boolean> {
      const memberships = await deps.membershipPort.listActiveByPlatformUser(platformUserId);
      return memberships.some((membership) => membership.organizationId === organizationId);
    },
  };
}

export type OrganizationMembershipService = ReturnType<typeof createOrganizationMembershipService>;
