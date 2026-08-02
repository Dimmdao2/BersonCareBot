import { resolveClinicSeatLimit } from '@/modules/org-entitlements/service';
import type { OrgEntitlementsPort } from '@/modules/org-entitlements/ports';
import type {
  OrganizationMemberDirectoryRecord,
  OrganizationMembershipPort,
} from '@/modules/organization-membership/ports';
import type { OrganizationInvitesPort } from '@/modules/organization-invites/ports';

/**
 * C4A — clinic boundary. Owner-approved seat policy (OWNER_REVIEW_2026-07-18.md addendum, C4C5-05):
 * a seat is consumed by an ACTIVE membership with an active specialist binding
 * (`status === "active" && specialistId != null`), independent of role — an owner or admin without
 * a specialist binding does not consume a seat, a bound admin does. A pending `doctor` invite
 * reserves a seat (the specialist binding doesn't exist yet at invite time); a pending `admin`
 * invite does not. A configured `limit` is a finite, nonnegative effective seat count (never
 * unlimited). Compatibility organizations may legitimately have no configured number; that state
 * is returned explicitly so read surfaces can name the missing setting instead of failing with 500.
 */
export function isSeatConsumingMember(
  member: Pick<OrganizationMemberDirectoryRecord, 'status' | 'specialistId'>,
): boolean {
  return member.status === 'active' && member.specialistId !== null;
}

export type ClinicSeatStatus =
  | {
      configured: true;
      limit: number;
      used: number;
      available: number;
    }
  | {
      configured: false;
      limit: null;
      used: number;
      available: null;
    };

export function createClinicSeatsService(deps: {
  membershipPort: OrganizationMembershipPort;
  invitesPort: OrganizationInvitesPort;
  orgEntitlementsPort: OrgEntitlementsPort;
  billingPort?: {
    getOrganizationBillingOverview(organizationId: string): Promise<{
      subscriptions: Array<{ source: string; paidAdditionalSeats: number }>;
    }>;
  };
}) {
  async function getSeatStatus(organizationId: string): Promise<ClinicSeatStatus> {
    const [members, inviteSeatReservations, baseLimit, billing] = await Promise.all([
      deps.membershipPort.listByOrganization(organizationId),
      deps.invitesPort.countSeatReservationsByOrganization(organizationId),
      resolveClinicSeatLimit(deps.orgEntitlementsPort, organizationId),
      deps.billingPort?.getOrganizationBillingOverview(organizationId) ?? Promise.resolve(null),
    ]);
    const paidAdditionalSeats = billing?.subscriptions.find(
      (subscription) => subscription.source === 'paid_subscription',
    )?.paidAdditionalSeats ?? 0;
    const limit = baseLimit === null ? null : baseLimit + paidAdditionalSeats;
    const activeSeatConsumers = members.filter(isSeatConsumingMember).length;
    const used = activeSeatConsumers + inviteSeatReservations;
    if (limit === null) {
      return { configured: false, limit: null, used, available: null };
    }
    return { configured: true, limit, used, available: Math.max(limit - used, 0) };
  }

  return {
    getSeatStatus,
  };
}

export type ClinicSeatsService = ReturnType<typeof createClinicSeatsService>;
