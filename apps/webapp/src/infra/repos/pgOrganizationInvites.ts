import { and, eq, isNull, sql } from 'drizzle-orm';
import { getDrizzle } from '@/app-layer/db/drizzle';
import { runWebappPgText, runWebappTransaction } from '@/infra/db/runWebappSql';
import { transactionQuotaPort } from '@/infra/repos/transactionQuotaPort';
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
      return getDrizzle().transaction((tx) =>
        transactionQuotaPort.withinLock(
          tx,
          { organizationId: input.organizationId, mechanic: 'clinic_team' },
          async (quota) => {
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
          // The authoritative capacity decision stays inside this organization's advisory-locked
          // transaction. The shared quota port uses the same effective tariff / active override
          // resolver as stock writers; route-level checks remain intentionally absent.
          // `i.invited_email <> $2` excludes this email's own prior pending reservation: a
          // same-email replacement at the limit does not add a reservation, so it must not be
          // counted against itself.
          const offer = await quota.resolveClinicTeamAvailability({
            excludedPendingEmail: input.invitedEmail,
          });
          if (offer.outcome === 'seat_not_sold') {
            return { ok: false, code: 'seat_limit_reached' };
          }
          // Р-15: оплаченный период кончился — отдельного счёта на место в нём быть не может,
          // остатка нет. Клиника сначала оплачивает продление, и только потом покупает место.
          if (offer.outcome === 'paid_period_over') {
            return { ok: false, code: 'seat_overage_paid_period_over' };
          }
          if (offer.outcome === 'purchasable') {
            return {
              ok: false,
              code: 'seat_overage_confirmation_required',
              priceMinor: offer.priceMinor,
              currency: offer.currency,
              dayEndsAt: offer.invoiceExpiresAt,
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
          },
        ),
      );
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
