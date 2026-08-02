import { and, eq, gt, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import { getDrizzle } from '@/app-layer/db/drizzle';
import { runWebappPgText, runWebappTransaction } from '@/infra/db/runWebappSql';
import type {
  AcceptOrganizationInviteResult,
  CreateOrganizationInviteResult,
  OrganizationInviteRecord,
  OrganizationInviteRole,
  OrganizationInviteStatus,
  OrganizationInvitesPort,
} from '@/modules/organization-invites/ports';
import { beOrganizationMembers, beOrganizations } from '../../../db/schema/bookingEngine';
import { organizationMemberInvites } from '../../../db/schema/organizationMemberInvites';
import { saasBillingSubscriptions } from '../../../db/schema/saasBilling';
import { saasOrgEntitlementOverrides } from '../../../db/schema/saasEntitlements';
import { platformUsers } from '../../../db/schema/schema';
import {
  ORGANIZATION_INVITE_ROLES,
  ORGANIZATION_INVITE_STATUSES,
} from '@/modules/organization-invites/ports';

type InviteRow = {
  id: string;
  organization_id: string;
  invited_email: string;
  invited_role: string;
  status: string;
  expires_at: string;
  created_by_platform_user_id: string;
  accepted_by_platform_user_id: string | null;
  accepted_membership_id: string | null;
  created_at: string;
  accepted_at: string | null;
  organization_title: string | null;
};

type AcceptOrgInviteFunctionRow = {
  ok: boolean;
  code: string | null;
  organization_id: string | null;
  membership_id: string | null;
  platform_user_id: string | null;
  specialist_id: string | null;
  role: string | null;
};

function parseInviteRole(value: string): OrganizationInviteRole {
  if (ORGANIZATION_INVITE_ROLES.includes(value as OrganizationInviteRole)) {
    return value as OrganizationInviteRole;
  }
  throw new Error(`Unexpected organization_member_invites.invited_role: ${value}`);
}

function parseInviteStatus(value: string): OrganizationInviteStatus {
  if (ORGANIZATION_INVITE_STATUSES.includes(value as OrganizationInviteStatus)) {
    return value as OrganizationInviteStatus;
  }
  throw new Error(`Unexpected organization_member_invites.status: ${value}`);
}

function mapAcceptFailureCode(
  value: string | null,
): Exclude<AcceptOrganizationInviteResult, { ok: true }>['code'] {
  switch (value) {
    case 'invalid_token':
    case 'expired_token':
    case 'reused_token':
    case 'email_mismatch':
    case 'entitlement_disabled':
    case 'seat_limit_reached':
      return value;
    default:
      throw new Error(`Unexpected app.accept_org_invite failure code: ${value ?? '<null>'}`);
  }
}

function mapInvite(row: InviteRow): OrganizationInviteRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    invitedEmail: row.invited_email,
    invitedRole: parseInviteRole(row.invited_role),
    status: parseInviteStatus(row.status),
    expiresAt: row.expires_at,
    createdByPlatformUserId: row.created_by_platform_user_id,
    acceptedByPlatformUserId: row.accepted_by_platform_user_id,
    acceptedMembershipId: row.accepted_membership_id,
    createdAt: row.created_at,
    acceptedAt: row.accepted_at,
    organizationTitle: row.organization_title,
  };
}

const inviteSelectSql = `
  SELECT
    i.id::text,
    i.organization_id::text,
    i.invited_email,
    i.invited_role,
    i.status,
    i.expires_at::text,
    i.created_by_platform_user_id::text,
    i.accepted_by_platform_user_id::text,
    i.accepted_membership_id::text,
    i.created_at::text,
    i.accepted_at::text,
    o.title AS organization_title
  FROM organization_member_invites i
  LEFT JOIN be_organizations o ON o.id = i.organization_id
`;

export function createPgOrganizationInvitesPort(): OrganizationInvitesPort {
  return {
    async createReplacingPending(input): Promise<CreateOrganizationInviteResult> {
      return getDrizzle().transaction(async (tx) => {
        // C4A correction: lock the whole organization (not organizationId+email) so that
        // concurrent invite-create calls for *different* emails in the same organization also
        // serialize, not just resends of the same email. This is the atomicity boundary the seat
        // capacity check below relies on — without it, two different-email requests could both
        // observe the last free seat and both insert.
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${'clinic_invite_seats:' + input.organizationId}, 0))`,
        );
        const [activeMember] = await tx
          .select({ id: beOrganizationMembers.id })
          .from(platformUsers)
          .innerJoin(
            beOrganizationMembers,
            and(
              eq(beOrganizationMembers.platformUserId, platformUsers.id),
              eq(beOrganizationMembers.organizationId, input.organizationId),
              eq(beOrganizationMembers.status, 'active'),
            ),
          )
          .where(
            and(
              eq(platformUsers.emailNormalized, input.invitedEmail),
              isNull(platformUsers.mergedIntoId),
            ),
          )
          .limit(1);
        if (activeMember) {
          return { ok: false, code: 'already_member' };
        }

        if (input.invitedRole === 'doctor') {
          // Atomic, race-safe seat capacity check — the authoritative enforcement (the JS-level
          // clinicSeats.assertSeatAvailableForInvite pre-check is best-effort UX only). Mirrors
          // resolveClinicSeatLimit's override > tariff precedence.
          // `clinic_team` is numeric, so the legacy boolean map cannot switch this limit off.
          // This is duplicated in SQL because it must run inside this same lock+transaction.
          // `i.invited_email <> $2` excludes this email's own prior pending reservation: a
          // same-email replacement at the limit does not add a reservation, so it must not be
          // counted against itself.
          // §5a item 5.1 — `additional_seat_price_minor`/`currency` come from the tariff alone
          // (never the per-org seat-limit override, which only ever moves the FREE included count):
          // a NULL price keeps §5.2's hard block; a configured price is returned to the separate
          // billing confirmation path. Capacity changes only after capture persists paid allowance.
          // §2.12 — `effective_tariff` reads through `app.saas_billing_effective_tariff`, the same
          // frozen/live switch every other reader of tariff content goes through: a live paid period
          // holds included_seats/overage price to what was configured at payment time.
          const tariffResult = await tx.execute(sql`
            SELECT
              tariff.included_seats,
              tariff.additional_seat_price_minor,
              tariff.currency
            FROM public.be_organizations AS organization
            LEFT JOIN LATERAL app.saas_billing_effective_tariff(
              organization.id,
              organization.tariff_id
            ) AS tariff ON true
            WHERE organization.id = ${input.organizationId}::uuid
          `);
          const tariff = tariffResult.rows[0] as
            | {
                included_seats: number | null;
                additional_seat_price_minor: number | null;
                currency: string | null;
              }
            | undefined;
          // A Drizzle transaction owns one node-postgres client. Keep these reads sequential:
          // concurrent client.query calls are deprecated by pg and will be rejected in pg 9.
          const [override] = await tx
            .select({ value: saasOrgEntitlementOverrides.seatLimitOverride })
            .from(saasOrgEntitlementOverrides)
            .where(
              and(
                eq(saasOrgEntitlementOverrides.organizationId, input.organizationId),
                eq(saasOrgEntitlementOverrides.mechanic, 'clinic_team'),
              ),
            )
            .limit(1);
          const [subscription] = await tx
            .select({ value: saasBillingSubscriptions.paidAdditionalSeats })
            .from(saasBillingSubscriptions)
            .where(
              and(
                eq(saasBillingSubscriptions.organizationId, input.organizationId),
                eq(saasBillingSubscriptions.source, 'paid_subscription'),
              ),
            )
            .limit(1);
          const [activeSeats] = await tx
            .select({ value: sql<number>`count(*)::int` })
            .from(beOrganizationMembers)
            .where(
              and(
                eq(beOrganizationMembers.organizationId, input.organizationId),
                eq(beOrganizationMembers.status, 'active'),
                isNotNull(beOrganizationMembers.specialistId),
              ),
            );
          const [pendingInvites] = await tx
            .select({ value: sql<number>`count(*)::int` })
            .from(organizationMemberInvites)
            .where(
              and(
                eq(organizationMemberInvites.organizationId, input.organizationId),
                eq(organizationMemberInvites.invitedRole, 'doctor'),
                eq(organizationMemberInvites.status, 'pending'),
                gt(organizationMemberInvites.expiresAt, sql`now()`),
                ne(organizationMemberInvites.invitedEmail, input.invitedEmail),
              ),
            );
          const [acceptedInvites] = await tx
            .select({ value: sql<number>`count(*)::int` })
            .from(organizationMemberInvites)
            .innerJoin(
              beOrganizationMembers,
              eq(beOrganizationMembers.id, organizationMemberInvites.acceptedMembershipId),
            )
            .where(
              and(
                eq(organizationMemberInvites.organizationId, input.organizationId),
                eq(organizationMemberInvites.invitedRole, 'doctor'),
                eq(organizationMemberInvites.status, 'accepted'),
                eq(beOrganizationMembers.status, 'active'),
                isNull(beOrganizationMembers.specialistId),
              ),
            );
          const includedSeats = override?.value ?? tariff?.included_seats ?? null;
          const limitValue = includedSeats === null
            ? null
            : includedSeats + (subscription?.value ?? 0);
          const usedValue =
            (activeSeats?.value ?? 0) +
            (pendingInvites?.value ?? 0) +
            (acceptedInvites?.value ?? 0);
          if (limitValue === null || limitValue === undefined || usedValue >= limitValue) {
            const overagePriceMinor = tariff?.additional_seat_price_minor ?? null;
            const overageCurrency = tariff?.currency ?? null;
            if (overagePriceMinor === null || overageCurrency === null) {
              return { ok: false, code: 'seat_limit_reached' };
            }
            return {
              ok: false,
              code: 'seat_overage_confirmation_required',
              priceMinor: overagePriceMinor,
              currency: overageCurrency,
            };
          }
        }

        await tx
          .update(organizationMemberInvites)
          .set({ status: 'revoked' })
          .where(
            and(
              eq(organizationMemberInvites.organizationId, input.organizationId),
              eq(organizationMemberInvites.invitedEmail, input.invitedEmail),
              eq(organizationMemberInvites.status, 'pending'),
            ),
          );

        const [invite] = await tx
          .insert(organizationMemberInvites)
          .values({
            organizationId: input.organizationId,
            invitedEmail: input.invitedEmail,
            invitedRole: input.invitedRole,
            tokenHash: input.tokenHash,
            expiresAt: input.expiresAt,
            createdByPlatformUserId: input.createdByPlatformUserId,
          })
          .returning();
        if (!invite) throw new Error('organization_invite_insert_failed');
        const [organization] = await tx
          .select({ title: beOrganizations.title })
          .from(beOrganizations)
          .where(eq(beOrganizations.id, input.organizationId))
          .limit(1);
        return {
          ok: true,
          invite: {
            ...invite,
            invitedRole: parseInviteRole(invite.invitedRole),
            status: parseInviteStatus(invite.status),
            organizationTitle: organization?.title ?? null,
          },
        };
      });
    },

    async listPendingByOrganization(organizationId) {
      return runWebappTransaction(async (tx) => {
        await runWebappPgText(
          `UPDATE organization_member_invites
           SET status = 'expired'
           WHERE organization_id = $1
             AND status = 'pending'
             AND expires_at <= now()`,
          [organizationId],
          tx,
        );
        const rows = await runWebappPgText<InviteRow>(
          `${inviteSelectSql}
           WHERE i.organization_id = $1
             AND i.status = 'pending'
             AND i.expires_at > now()
           ORDER BY i.created_at DESC`,
          [organizationId],
          tx,
        );
        return rows.rows.map(mapInvite);
      });
    },

    async countSeatReservationsByOrganization(organizationId) {
      const rows = await runWebappPgText<{ reservation_count: number }>(
        `SELECT COUNT(*)::int AS reservation_count
         FROM organization_member_invites i
         LEFT JOIN be_organization_members m ON m.id = i.accepted_membership_id
         WHERE i.organization_id = $1
           AND i.invited_role = 'doctor'
           AND (
             (i.status = 'pending' AND i.expires_at > now())
             OR
             (i.status = 'accepted' AND m.status = 'active' AND m.specialist_id IS NULL)
           )`,
        [organizationId],
      );
      return rows.rows[0]?.reservation_count ?? 0;
    },

    async getByTokenHash(tokenHash) {
      const rows = await runWebappPgText<InviteRow>(
        `SELECT
           id::text,
           organization_id::text,
           invited_email,
           invited_role,
           status,
           expires_at::text,
           created_by_platform_user_id::text,
           accepted_by_platform_user_id::text,
           accepted_membership_id::text,
           created_at::text,
           accepted_at::text,
           organization_title
         FROM app.lookup_pending_org_invite($1)`,
        [tokenHash],
      );
      return rows.rows[0] ? mapInvite(rows.rows[0]) : null;
    },

    async expireInvite(inviteId) {
      await runWebappPgText(
        `UPDATE organization_member_invites
         SET status = 'expired'
         WHERE id = $1
           AND status = 'pending'`,
        [inviteId],
      );
    },

    async revokePendingByOrganization({ organizationId, inviteId }) {
      const res = await runWebappPgText<{ id: string }>(
        `UPDATE organization_member_invites
         SET status = 'revoked'
         WHERE id = $1
           AND organization_id = $2
           AND status = 'pending'
         RETURNING id::text`,
        [inviteId, organizationId],
      );
      return Boolean(res.rows[0]);
    },

    async acceptPendingByTokenHash({
      tokenHash,
      platformUserId,
      expectedEmail,
    }): Promise<AcceptOrganizationInviteResult> {
      const accepted = await runWebappPgText<AcceptOrgInviteFunctionRow>(
        `SELECT
           ok,
           code,
           organization_id::text,
           membership_id::text,
           platform_user_id::text,
           specialist_id::text,
           role
         FROM app.accept_org_invite($1, $2::uuid, $3)`,
        [tokenHash, platformUserId, expectedEmail],
      );
      const row = accepted.rows[0];
      if (!row) throw new Error('app.accept_org_invite_returned_no_rows');
      if (!row.ok) {
        return { ok: false, code: mapAcceptFailureCode(row.code) };
      }
      if (!row.organization_id || !row.membership_id || !row.platform_user_id || !row.role) {
        throw new Error('app.accept_org_invite_returned_incomplete_success');
      }
      return {
        ok: true,
        organizationId: row.organization_id,
        membershipId: row.membership_id,
        platformUserId: row.platform_user_id,
        specialistId: row.specialist_id,
        role: parseInviteRole(row.role),
      };
    },
  };
}
