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
};

export type OrganizationResolution =
  | { ok: true; context: OrganizationMembershipContext }
  | { ok: false; reason: "no_active_membership" };

function canManageOrganization(role: OrganizationMembershipRole): boolean {
  return role === "owner" || role === "admin";
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
      return deps.membershipPort.listByOrganization(organizationId);
    },

    async hasActiveMembership(platformUserId: string, organizationId: string): Promise<boolean> {
      const memberships = await deps.membershipPort.listActiveByPlatformUser(platformUserId);
      return memberships.some((membership) => membership.organizationId === organizationId);
    },
  };
}

export type OrganizationMembershipService = ReturnType<typeof createOrganizationMembershipService>;
