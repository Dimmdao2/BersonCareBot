import { and, desc, eq, gt, sql } from "drizzle-orm";
import { getCurrentDbPrincipalOrganizationId } from "@bersoncare/db-principal";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { patientInvites } from "../../../db/schema/patientInvites";
import { orgEnrollments } from "../../../db/schema/bookingEngine";
import type {
  PatientInviteFailure,
  PatientInviteLifecycleCode,
  PatientInvitePublicPreview,
  PatientInviteRecord,
  PatientInvitesPort,
} from "@/modules/patient-invites/ports";

type FunctionBaseRow = {
  ok: boolean;
  code: string | null;
};

type PreviewFunctionRow = FunctionBaseRow & {
  organization_title: string | null;
  recipient_hint: string | null;
  invite_expires_at: Date | string | null;
};

type PrepareProofRow = FunctionBaseRow & { patient_user_id: string | null };
type EmailProofRow = {
  patient_user_id: string;
  challenge_id: string;
  email_normalized: string;
};
type RedeemRow = FunctionBaseRow & {
  platform_user_id: string | null;
  organization_id: string | null;
};

function exactOrganization(organizationId: string): void {
  if (getCurrentDbPrincipalOrganizationId() !== organizationId) {
    throw new Error("organization_principal_mismatch");
  }
}

function lifecycleCode(value: string | null): PatientInviteLifecycleCode {
  switch (value) {
    case "invalid_token":
    case "invalid_continuation":
    case "expired_token":
    case "revoked_token":
    case "superseded_token":
    case "already_linked":
    case "wrong_recipient":
    case "conflicting_identity":
    case "wrong_org":
    case "organization_unavailable":
    case "inactive_relationship":
      return value;
    default:
      return "invalid_token";
  }
}

function failure(value: string | null): PatientInviteFailure {
  return { ok: false, code: lifecycleCode(value) };
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function mapInvite(row: typeof patientInvites.$inferSelect): PatientInviteRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    patientUserId: row.patientUserId,
    enrollmentId: row.enrollmentId,
    status: row.status as PatientInviteRecord["status"],
    expiresAt: iso(row.expiresAt),
    createdAt: iso(row.createdAt),
  };
}

function mapPreview(row: PreviewFunctionRow): PatientInvitePublicPreview | null {
  if (!row.organization_title || !row.invite_expires_at) return null;
  return {
    organizationTitle: row.organization_title,
    recipientHint: row.recipient_hint,
    inviteExpiresAt: iso(row.invite_expires_at),
  };
}

export function createPgPatientInvitesPort(): PatientInvitesPort {
  return {
    async getPortalStatus({ organizationId, patientUserId }) {
      exactOrganization(organizationId);
      const db = getDrizzle();
      const now = new Date().toISOString();
      const [enrollment] = await db
        .select({ status: orgEnrollments.status })
        .from(orgEnrollments)
        .where(
          and(
            eq(orgEnrollments.organizationId, organizationId),
            eq(orgEnrollments.platformUserId, patientUserId),
          ),
        )
        .limit(1);
      if (enrollment?.status === "active") {
        return { status: "linked", inviteId: null, expiresAt: null };
      }
      if (enrollment?.status !== "invited") {
        return { status: "not_activated", inviteId: null, expiresAt: null };
      }
      const [pending] = await db
        .select({ id: patientInvites.id, expiresAt: patientInvites.expiresAt })
        .from(patientInvites)
        .where(
          and(
            eq(patientInvites.organizationId, organizationId),
            eq(patientInvites.patientUserId, patientUserId),
            eq(patientInvites.status, "pending"),
            gt(patientInvites.expiresAt, now),
          ),
        )
        .orderBy(desc(patientInvites.createdAt))
        .limit(1);
      return pending
        ? { status: "invited", inviteId: pending.id, expiresAt: iso(pending.expiresAt) }
        : { status: "not_activated", inviteId: null, expiresAt: null };
    },

    async createReplacingPending(input) {
      exactOrganization(input.organizationId);
      const db = getDrizzle();
      return db.transaction(async (tx) => {
        const [enrollment] = await tx
          .select({ id: orgEnrollments.id, status: orgEnrollments.status })
          .from(orgEnrollments)
          .where(
            and(
              eq(orgEnrollments.organizationId, input.organizationId),
              eq(orgEnrollments.platformUserId, input.patientUserId),
            ),
          )
          .for("update")
          .limit(1);
        if (!enrollment) return failure("wrong_org");
        if (enrollment.status === "active") return failure("already_linked");
        if (enrollment.status !== "invited") return failure("inactive_relationship");

        await tx
          .update(patientInvites)
          .set({
            status: "superseded",
            supersededByInviteId: input.id,
            continuationHash: null,
            continuationExpiresAt: null,
            proofEmailNormalized: null,
            proofChallengeId: null,
            updatedAt: new Date().toISOString(),
          })
          .where(
            and(
              eq(patientInvites.organizationId, input.organizationId),
              eq(patientInvites.patientUserId, input.patientUserId),
              eq(patientInvites.status, "pending"),
            ),
          );

        const [created] = await tx
          .insert(patientInvites)
          .values({
            id: input.id,
            organizationId: input.organizationId,
            patientUserId: input.patientUserId,
            enrollmentId: enrollment.id,
            tokenHash: input.tokenHash,
            invitedEmailNormalized: input.invitedEmailNormalized,
            expiresAt: input.expiresAt,
            createdByPlatformUserId: input.createdByPlatformUserId,
          })
          .returning();
        if (!created) throw new Error("patient_invite_insert_failed");
        return { ok: true, invite: mapInvite(created) };
      });
    },

    async revokePending({ organizationId, patientUserId, inviteId, revokedByPlatformUserId }) {
      exactOrganization(organizationId);
      const db = getDrizzle();
      return db.transaction(async (tx) => {
        const updated = await tx
          .update(patientInvites)
          .set({
            status: "revoked",
            revokedAt: new Date().toISOString(),
            revokedByPlatformUserId,
            continuationHash: null,
            continuationExpiresAt: null,
            proofEmailNormalized: null,
            proofChallengeId: null,
            updatedAt: new Date().toISOString(),
          })
          .where(
            and(
              eq(patientInvites.id, inviteId),
              eq(patientInvites.organizationId, organizationId),
              eq(patientInvites.patientUserId, patientUserId),
              eq(patientInvites.status, "pending"),
            ),
          )
          .returning({ id: patientInvites.id });
        return updated.length === 1;
      });
    },

    async exchangeBearer(input) {
      const db = getDrizzle();
      const result = await db.transaction((tx) =>
        tx.execute<PreviewFunctionRow>(sql`
          SELECT ok, code, organization_title, recipient_hint, invite_expires_at
          FROM app.exchange_patient_invite(
            ${input.tokenHash},
            ${input.continuationHash},
            ${input.continuationExpiresAt}::timestamptz
          )
        `),
      );
      const row = result.rows[0];
      if (!row?.ok) return failure(row?.code ?? "invalid_token");
      const preview = mapPreview(row);
      return preview ? { ok: true, preview } : failure("organization_unavailable");
    },

    async lookupContinuation(continuationHash) {
      const db = getDrizzle();
      const result = await db.execute<PreviewFunctionRow>(sql`
        SELECT ok, code, organization_title, recipient_hint, invite_expires_at
        FROM app.lookup_patient_invite_continuation(${continuationHash})
      `);
      const row = result.rows[0];
      if (!row?.ok) return failure(row?.code ?? "invalid_continuation");
      const preview = mapPreview(row);
      return preview ? { ok: true, preview } : failure("invalid_continuation");
    },

    async prepareEmailProof({ continuationHash, emailNormalized }) {
      const db = getDrizzle();
      const result = await db.transaction((tx) =>
        tx.execute<PrepareProofRow>(sql`
          SELECT ok, code, patient_user_id
          FROM app.prepare_patient_invite_email_proof(${continuationHash}, ${emailNormalized})
        `),
      );
      const row = result.rows[0];
      return row?.ok && row.patient_user_id
        ? { ok: true, patientUserId: row.patient_user_id }
        : failure(row?.code ?? "invalid_continuation");
    },

    async bindEmailChallenge({ continuationHash, emailNormalized, challengeId }) {
      const db = getDrizzle();
      const result = await db.transaction((tx) =>
        tx.execute<{ bound: boolean }>(sql`
          SELECT app.bind_patient_invite_email_challenge(
            ${continuationHash}, ${emailNormalized}, ${challengeId}::uuid
          ) AS bound
        `),
      );
      return result.rows[0]?.bound === true;
    },

    async readEmailProof(continuationHash) {
      const db = getDrizzle();
      const result = await db.execute<EmailProofRow>(sql`
        SELECT patient_user_id, challenge_id, email_normalized
        FROM app.read_patient_invite_email_proof(${continuationHash})
      `);
      const row = result.rows[0];
      return row
        ? {
            patientUserId: row.patient_user_id,
            challengeId: row.challenge_id,
            emailNormalized: row.email_normalized,
          }
        : null;
    },

    async redeemEmailProof({ continuationHash, challengeId, emailNormalized }) {
      const db = getDrizzle();
      const result = await db.transaction((tx) =>
        tx.execute<RedeemRow>(sql`
          SELECT ok, code, platform_user_id, organization_id
          FROM app.redeem_patient_invite_email(
            ${continuationHash}, ${challengeId}::uuid, ${emailNormalized}
          )
        `),
      );
      const row = result.rows[0];
      return row?.ok && row.platform_user_id && row.organization_id
        ? {
            ok: true,
            platformUserId: row.platform_user_id,
            organizationId: row.organization_id,
          }
        : failure(row?.code ?? "invalid_continuation");
    },
  };
}
