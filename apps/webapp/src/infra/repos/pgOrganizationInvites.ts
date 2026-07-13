import { runWebappPgText, runWebappTransaction } from "@/infra/db/runWebappSql";
import type {
  AcceptOrganizationInviteResult,
  CreateOrganizationInviteResult,
  OrganizationInviteRecord,
  OrganizationInviteRole,
  OrganizationInviteStatus,
  OrganizationInvitesPort,
} from "@/modules/organization-invites/ports";
import {
  ORGANIZATION_INVITE_ROLES,
  ORGANIZATION_INVITE_STATUSES,
} from "@/modules/organization-invites/ports";

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

function mapAcceptFailureCode(value: string | null): Exclude<AcceptOrganizationInviteResult, { ok: true }>["code"] {
  switch (value) {
    case "invalid_token":
    case "expired_token":
    case "reused_token":
    case "email_mismatch":
      return value;
    default:
      throw new Error(`Unexpected app.accept_org_invite failure code: ${value ?? "<null>"}`);
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
      return runWebappTransaction(async (tx) => {
        const activeMember = await runWebappPgText<{ id: string }>(
          `SELECT m.id::text
           FROM platform_users u
           JOIN be_organization_members m
             ON m.platform_user_id = u.id
            AND m.organization_id = $1
            AND m.status = 'active'
           WHERE u.email_normalized = $2
             AND u.merged_into_id IS NULL
           LIMIT 1`,
          [input.organizationId, input.invitedEmail],
          tx,
        );
        if (activeMember.rows[0]) {
          return { ok: false, code: "already_member" };
        }

        await runWebappPgText(
          `UPDATE organization_member_invites
           SET status = 'revoked'
           WHERE organization_id = $1
             AND invited_email = $2
             AND status = 'pending'`,
          [input.organizationId, input.invitedEmail],
          tx,
        );

        const inserted = await runWebappPgText<InviteRow>(
          // NOTE: select FROM the data-modifying CTE (`i`), NOT a fresh scan of
          // organization_member_invites — a re-scan of the same table inside a
          // data-modifying CTE does not see the just-inserted row (Postgres CTE
          // snapshot semantics), which silently returned 0 rows. Joining be_organizations
          // (a different table) is fine.
          `WITH i AS (
             INSERT INTO organization_member_invites (
               organization_id,
               invited_email,
               invited_role,
               token_hash,
               expires_at,
               created_by_platform_user_id
             )
             VALUES ($1, $2, $3, $4, $5::timestamptz, $6)
             RETURNING
               id,
               organization_id,
               invited_email,
               invited_role,
               status,
               expires_at,
               created_by_platform_user_id,
               accepted_by_platform_user_id,
               accepted_membership_id,
               created_at,
               accepted_at
           )
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
           FROM i
           LEFT JOIN be_organizations o ON o.id = i.organization_id`,
          [
            input.organizationId,
            input.invitedEmail,
            input.invitedRole,
            input.tokenHash,
            input.expiresAt,
            input.createdByPlatformUserId,
          ],
          tx,
        );
        const invite = inserted.rows[0];
        if (!invite) throw new Error("organization_invite_insert_failed");
        return { ok: true, invite: mapInvite(invite) };
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
      if (!row) throw new Error("app.accept_org_invite_returned_no_rows");
      if (!row.ok) {
        return { ok: false, code: mapAcceptFailureCode(row.code) };
      }
      if (!row.organization_id || !row.membership_id || !row.platform_user_id || !row.role) {
        throw new Error("app.accept_org_invite_returned_incomplete_success");
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
