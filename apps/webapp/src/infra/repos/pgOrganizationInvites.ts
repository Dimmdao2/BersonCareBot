import { runWebappPgText, runWebappTransaction, type WebappSqlTransactionExecutor } from "@/infra/db/runWebappSql";
import { getPool } from "@/infra/db/client";
import { resolveCanonicalUserId } from "@/infra/repos/pgCanonicalPlatformUser";
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

async function findOrCreatePlatformUserByEmailInTx(
  emailNorm: string,
  tx: WebappSqlTransactionExecutor,
): Promise<{ id: string; displayName: string }> {
  const existing = await runWebappPgText<{ id: string; display_name: string }>(
    `SELECT id::text, display_name
     FROM platform_users
     WHERE email_normalized = $1 AND merged_into_id IS NULL
     LIMIT 1
     FOR UPDATE`,
    [emailNorm],
    tx,
  );
  if (existing.rows[0]) {
    return { id: existing.rows[0].id, displayName: existing.rows[0].display_name };
  }

  const merged = await runWebappPgText<{ id: string }>(
    `SELECT id::text
     FROM platform_users
     WHERE email_normalized = $1 AND merged_into_id IS NOT NULL
     ORDER BY created_at ASC
     LIMIT 1`,
    [emailNorm],
    tx,
  );
  if (merged.rows[0]) {
    const canonical = await resolveCanonicalUserId(getPool(), merged.rows[0].id);
    if (canonical) {
      const canonicalRow = await runWebappPgText<{ id: string; display_name: string }>(
        `SELECT id::text, display_name
         FROM platform_users
         WHERE id = $1
         LIMIT 1
         FOR UPDATE`,
        [canonical],
        tx,
      );
      if (canonicalRow.rows[0]) {
        return {
          id: canonicalRow.rows[0].id,
          displayName: canonicalRow.rows[0].display_name,
        };
      }
    }
  }

  const fallbackDisplayName = emailNorm.split("@")[0] ?? emailNorm;
  const inserted = await runWebappPgText<{ id: string; display_name: string }>(
    `INSERT INTO platform_users (email, email_normalized, display_name, role, email_verified_at)
     VALUES ($1, $1, $2, 'client', now())
     ON CONFLICT (email_normalized) WHERE merged_into_id IS NULL AND email_normalized IS NOT NULL DO NOTHING
     RETURNING id::text, display_name`,
    [emailNorm, fallbackDisplayName],
    tx,
  );
  if (inserted.rows[0]) {
    return { id: inserted.rows[0].id, displayName: inserted.rows[0].display_name };
  }

  const retry = await runWebappPgText<{ id: string; display_name: string }>(
    `SELECT id::text, display_name
     FROM platform_users
     WHERE email_normalized = $1 AND merged_into_id IS NULL
     LIMIT 1
     FOR UPDATE`,
    [emailNorm],
    tx,
  );
  if (!retry.rows[0]) {
    throw new Error("organization_invite_user_find_or_create_failed");
  }
  return { id: retry.rows[0].id, displayName: retry.rows[0].display_name };
}

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
        `${inviteSelectSql}
         WHERE i.token_hash = $1
         LIMIT 1`,
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

    async acceptPendingByTokenHash({ tokenHash, expectedEmail }): Promise<AcceptOrganizationInviteResult> {
      return runWebappTransaction(async (tx) => {
        const locked = await runWebappPgText<InviteRow>(
          `${inviteSelectSql}
           WHERE i.token_hash = $1
           LIMIT 1
           FOR UPDATE OF i`,
          [tokenHash],
          tx,
        );
        const invite = locked.rows[0] ? mapInvite(locked.rows[0]) : null;
        if (!invite) return { ok: false, code: "invalid_token" };
        if (invite.status !== "pending") return { ok: false, code: "reused_token" };
        if (new Date(invite.expiresAt).getTime() <= Date.now()) {
          await runWebappPgText(
            `UPDATE organization_member_invites
             SET status = 'expired'
             WHERE id = $1
               AND status = 'pending'`,
            [invite.id],
            tx,
          );
          return { ok: false, code: "expired_token" };
        }
        if (invite.invitedEmail !== expectedEmail) {
          return { ok: false, code: "email_mismatch" };
        }

        const user = await findOrCreatePlatformUserByEmailInTx(invite.invitedEmail, tx);
        const displayName = user.displayName.trim() || invite.invitedEmail.split("@")[0] || invite.invitedEmail;
        await runWebappPgText(
          `UPDATE platform_users
           SET role = 'doctor',
               email = COALESCE(email, $2),
               email_normalized = COALESCE(email_normalized, $2),
               email_verified_at = COALESCE(email_verified_at, now()),
               updated_at = now()
           WHERE id = $1`,
          [user.id, invite.invitedEmail],
          tx,
        );

        let specialistId: string | null = null;
        if (invite.invitedRole === "doctor") {
          const specialist = await runWebappPgText<{ id: string }>(
            `INSERT INTO be_specialists (organization_id, full_name, is_active, sort_order, created_at, updated_at)
             VALUES ($1, $2, true, 0, now(), now())
             RETURNING id::text`,
            [invite.organizationId, displayName],
            tx,
          );
          specialistId = specialist.rows[0]?.id ?? null;
          if (!specialistId) throw new Error("organization_invite_specialist_insert_failed");
        }

        const membership = await runWebappPgText<{ id: string; specialist_id: string | null }>(
          `INSERT INTO be_organization_members (
             organization_id,
             platform_user_id,
             role,
             specialist_id,
             status,
             created_at,
             updated_at
           )
           VALUES ($1, $2, $3, $4, 'active', now(), now())
           ON CONFLICT (organization_id, platform_user_id)
           DO UPDATE SET
             role = EXCLUDED.role,
             specialist_id = EXCLUDED.specialist_id,
             status = 'active',
             updated_at = now()
           RETURNING id::text, specialist_id::text`,
          [invite.organizationId, user.id, invite.invitedRole, specialistId],
          tx,
        );
        const membershipRow = membership.rows[0];
        if (!membershipRow) throw new Error("organization_invite_membership_insert_failed");

        await runWebappPgText(
          `UPDATE organization_member_invites
           SET status = 'accepted',
               accepted_by_platform_user_id = $2,
               accepted_membership_id = $3,
               accepted_at = now()
           WHERE id = $1`,
          [invite.id, user.id, membershipRow.id],
          tx,
        );

        return {
          ok: true,
          organizationId: invite.organizationId,
          membershipId: membershipRow.id,
          platformUserId: user.id,
          specialistId: membershipRow.specialist_id,
          role: invite.invitedRole,
        };
      });
    },
  };
}
