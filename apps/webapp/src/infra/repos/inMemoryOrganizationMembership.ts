import type {
  OrganizationMembership,
  OrganizationMembershipPort,
  OrganizationSpecialistDirectoryRecord,
} from "@/modules/organization-membership/ports";

const rows: OrganizationMembership[] = [];
const specialists: OrganizationSpecialistDirectoryRecord[] = [];

export function resetInMemoryOrganizationMembershipsForTests(
  nextRows: OrganizationMembership[] = [],
  nextSpecialists: OrganizationSpecialistDirectoryRecord[] = [],
): void {
  rows.length = 0;
  rows.push(...nextRows);
  specialists.length = 0;
  specialists.push(...nextSpecialists);
}

export function createInMemoryOrganizationMembershipPort(): OrganizationMembershipPort {
  return {
    async listByPlatformUser(platformUserId) {
      return rows.filter((row) => row.platformUserId === platformUserId);
    },

    async listActiveByPlatformUser(platformUserId) {
      return rows.filter((row) => row.platformUserId === platformUserId && row.status === "active");
    },

    async listByOrganization(organizationId) {
      return rows
        .filter((row) => row.organizationId === organizationId)
        .map((row) => ({ ...row, displayName: null }));
    },

    async listSpecialistsByOrganization(organizationId) {
      return specialists.filter((specialist) => specialist.organizationId === organizationId);
    },
  };
}
