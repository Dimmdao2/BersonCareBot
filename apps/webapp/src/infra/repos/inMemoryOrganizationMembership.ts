import type { OrganizationMembership, OrganizationMembershipPort } from "@/modules/organization-membership/ports";

const rows: OrganizationMembership[] = [];

export function resetInMemoryOrganizationMembershipsForTests(nextRows: OrganizationMembership[] = []): void {
  rows.length = 0;
  rows.push(...nextRows);
}

export function createInMemoryOrganizationMembershipPort(): OrganizationMembershipPort {
  return {
    async listByPlatformUser(platformUserId) {
      return rows.filter((row) => row.platformUserId === platformUserId);
    },

    async listActiveByPlatformUser(platformUserId) {
      return rows.filter((row) => row.platformUserId === platformUserId && row.status === "active");
    },
  };
}
