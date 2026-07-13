import type {
  OrganizationMemberDirectoryRecord,
  OrganizationMembership,
  OrganizationMembershipPort,
  OrganizationMembershipRole,
} from "./ports";

export type ResolveOrganizationForUserInput = {
  platformUserId: string;
  selectedOrganizationId?: string | null;
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
  | { ok: false; reason: "no_active_membership" }
  | { ok: false; reason: "membership_selection_required"; organizationIds: string[] }
  | { ok: false; reason: "selected_membership_not_found" };

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

      const selectedOrganizationId = input.selectedOrganizationId?.trim() || null;
      if (selectedOrganizationId) {
        const selected = memberships.find((membership) => membership.organizationId === selectedOrganizationId);
        if (!selected) {
          return { ok: false, reason: "selected_membership_not_found" };
        }
        return { ok: true, context: toMembershipContext(selected) };
      }

      if (memberships.length > 1) {
        return {
          ok: false,
          reason: "membership_selection_required",
          organizationIds: memberships.map((membership) => membership.organizationId),
        };
      }

      return { ok: true, context: toMembershipContext(memberships[0]) };
    },

    async listOrganizationMembers(organizationId: string): Promise<OrganizationMemberDirectoryRecord[]> {
      return deps.membershipPort.listByOrganization(organizationId);
    },
  };
}

export type OrganizationMembershipService = ReturnType<typeof createOrganizationMembershipService>;
