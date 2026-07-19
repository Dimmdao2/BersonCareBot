import { resolveClinicSeatLimit } from "@/modules/org-entitlements/service";
import type { OrgEntitlementsPort } from "@/modules/org-entitlements/ports";
import type { OrganizationMemberDirectoryRecord, OrganizationMembershipPort } from "@/modules/organization-membership/ports";
import type { OrganizationInviteRole, OrganizationInvitesPort } from "@/modules/organization-invites/ports";

/**
 * C4A — clinic boundary. Owner-approved seat policy (OWNER_REVIEW_2026-07-18.md addendum, C4C5-05):
 * a seat is consumed by an ACTIVE membership with an active specialist binding
 * (`status === "active" && specialistId != null`), independent of role — an owner or admin without
 * a specialist binding does not consume a seat, a bound admin does. A pending `doctor` invite
 * reserves a seat (the specialist binding doesn't exist yet at invite time); a pending `admin`
 * invite does not. `limit` is always a finite, nonnegative effective seat count (never unlimited);
 * see `resolveClinicSeatLimit`.
 */
export function isSeatConsumingMember(member: Pick<OrganizationMemberDirectoryRecord, "status" | "specialistId">): boolean {
  return member.status === "active" && member.specialistId !== null;
}

export type ClinicSeatStatus = {
  limit: number;
  used: number;
  available: number;
};

export function createClinicSeatsService(deps: {
  membershipPort: OrganizationMembershipPort;
  invitesPort: OrganizationInvitesPort;
  orgEntitlementsPort: OrgEntitlementsPort;
}) {
  async function getSeatStatus(organizationId: string): Promise<ClinicSeatStatus> {
    const [members, inviteSeatReservations, limit] = await Promise.all([
      deps.membershipPort.listByOrganization(organizationId),
      deps.invitesPort.countSeatReservationsByOrganization(organizationId),
      resolveClinicSeatLimit(deps.orgEntitlementsPort, organizationId),
    ]);
    const activeSeatConsumers = members.filter(isSeatConsumingMember).length;
    const used = activeSeatConsumers + inviteSeatReservations;
    return { limit, used, available: Math.max(limit - used, 0) };
  }

  return {
    getSeatStatus,
    /**
     * An `admin` invite never consumes a seat and is always allowed by seat policy. This is a
     * best-effort, non-atomic pre-check for fast UX feedback — the authoritative, race-safe
     * enforcement runs inside the same DB transaction as the invite insert
     * (`pgOrganizationInvites.createReplacingPending`).
     */
    async assertSeatAvailableForInvite(
      organizationId: string,
      role: OrganizationInviteRole,
    ): Promise<{ ok: true } | { ok: false; code: "seat_limit_reached" }> {
      if (role !== "doctor") return { ok: true };
      const status = await getSeatStatus(organizationId);
      if (status.used >= status.limit) {
        return { ok: false, code: "seat_limit_reached" };
      }
      return { ok: true };
    },
  };
}

export type ClinicSeatsService = ReturnType<typeof createClinicSeatsService>;
