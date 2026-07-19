import { resolveClinicSeatLimit } from "@/modules/org-entitlements/service";
import type { OrgEntitlementsPort } from "@/modules/org-entitlements/ports";
import type { OrganizationMembershipPort } from "@/modules/organization-membership/ports";
import type { OrganizationInviteRole, OrganizationInvitesPort } from "@/modules/organization-invites/ports";

/**
 * C4A — clinic boundary. Owner-approved seat policy (OWNER_REVIEW_2026-07-18.md addendum, C4C5-05):
 * an active `owner`/`doctor` membership consumes a seat; a non-clinical `admin` does not; a pending
 * `doctor` invite reserves a seat; a pending `admin` invite does not (it never consumes one on
 * accept either). `limit` is the effective included/override seat count; `null` means unlimited.
 */
const SEAT_CONSUMING_MEMBERSHIP_ROLES = new Set(["owner", "doctor"]);

export type ClinicSeatStatus = {
  limit: number | null;
  used: number;
  available: number | null;
};

export function createClinicSeatsService(deps: {
  membershipPort: OrganizationMembershipPort;
  invitesPort: OrganizationInvitesPort;
  orgEntitlementsPort: OrgEntitlementsPort;
}) {
  async function getSeatStatus(organizationId: string): Promise<ClinicSeatStatus> {
    const [members, pendingInvites, limit] = await Promise.all([
      deps.membershipPort.listByOrganization(organizationId),
      deps.invitesPort.listPendingByOrganization(organizationId),
      resolveClinicSeatLimit(deps.orgEntitlementsPort, organizationId),
    ]);
    const activeSeatConsumers = members.filter(
      (member) => member.status === "active" && SEAT_CONSUMING_MEMBERSHIP_ROLES.has(member.role),
    ).length;
    const pendingSeatReservations = pendingInvites.filter((invite) => invite.invitedRole === "doctor").length;
    const used = activeSeatConsumers + pendingSeatReservations;
    return { limit, used, available: limit === null ? null : Math.max(limit - used, 0) };
  }

  return {
    getSeatStatus,
    /** An `admin` invite never consumes a seat and is always allowed by seat policy. */
    async assertSeatAvailableForInvite(
      organizationId: string,
      role: OrganizationInviteRole,
    ): Promise<{ ok: true } | { ok: false; code: "seat_limit_reached" }> {
      if (role !== "doctor") return { ok: true };
      const status = await getSeatStatus(organizationId);
      if (status.limit !== null && status.used >= status.limit) {
        return { ok: false, code: "seat_limit_reached" };
      }
      return { ok: true };
    },
  };
}

export type ClinicSeatsService = ReturnType<typeof createClinicSeatsService>;
