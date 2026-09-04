import { and, desc, eq, gt, inArray, isNotNull, sql } from 'drizzle-orm';
import {
  getCurrentDbPrincipalOrganizationId,
  getCurrentDbPrincipalPlatformUserId,
} from '@bersoncare/db-principal';
import { getDrizzle } from '@/app-layer/db/drizzle';
import { patientInvites } from '../../../db/schema/patientInvites';
import { orgEnrollments } from '../../../db/schema/bookingEngine';
import type {
  PatientInviteFailure,
  PatientInviteLifecycleCode,
  PatientInvitePublicPreview,
  PatientInviteRecord,
  PatientInvitesPort,
} from '@/modules/patient-invites/ports';

type FunctionBaseRow = {
  ok: boolean;
  code: string | null;
};

type PreviewFunctionRow = FunctionBaseRow & {
  organization_title: string | null;
  recipient_hint: string | null;
  invite_expires_at: Date | string | null;
};

type RedeemRow = FunctionBaseRow & {
  organization_id: string | null;
};

type ClaimRow = RedeemRow & {
  patient_user_id: string | null;
};

function exactOrganization(organizationId: string): void {
  if (getCurrentDbPrincipalOrganizationId() !== organizationId) {
    throw new Error('organization_principal_mismatch');
  }
}

function lifecycleCode(value: string | null): PatientInviteLifecycleCode {
  switch (value) {
    case 'invalid_token':
    case 'invalid_continuation':
    case 'expired_token':
    case 'revoked_token':
    case 'superseded_token':
    case 'exchanged_token':
    case 'already_linked':
    case 'wrong_recipient':
    case 'missing_recipient':
    case 'invalid_invite':
    case 'unproved_identity':
    case 'rate_limited':
    case 'conflicting_identity':
    case 'wrong_org':
    case 'organization_unavailable':
    case 'inactive_relationship':
      return value;
    default:
      return 'invalid_token';
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
    status: row.status as PatientInviteRecord['status'],
    expiresAt: iso(row.expiresAt),
    createdAt: iso(row.createdAt),
    recipientBinding: row.recipientBinding as PatientInviteRecord['recipientBinding'],
  };
}

function mapPreview(row: PreviewFunctionRow): PatientInvitePublicPreview | null {
  if (!row.organization_title || !row.invite_expires_at) return null;
  return {
    organizationTitle: row.organization_title,
    recipientHint: row.recipient_hint,
    inviteExpiresAt: iso(row.invite_expires_at),
    recipientBinding: row.recipient_hint ? 'bound_email' : 'unbound_email_claim',
  };
}

export function createPgPatientInvitesPort(): PatientInvitesPort {
  return {
    async getPortalStatus({ organizationId, patientUserId }) {
      exactOrganization(organizationId);
      const db = getDrizzle();
      const now = new Date().toISOString();
      const [enrollment] = await db
        .select({
          status: orgEnrollments.status,
          portalActivatedAt: orgEnrollments.portalActivatedAt,
        })
        .from(orgEnrollments)
        .where(
          and(
            eq(orgEnrollments.organizationId, organizationId),
            eq(orgEnrollments.platformUserId, patientUserId),
          ),
        )
        .limit(1);
      if (enrollment?.portalActivatedAt) {
        return { status: 'linked', inviteId: null, expiresAt: null };
      }
      if (enrollment?.status !== 'invited' && enrollment?.status !== 'active') {
        return { status: 'not_activated', inviteId: null, expiresAt: null };
      }
      const [pending] = await db
        .select({ id: patientInvites.id, expiresAt: patientInvites.expiresAt })
        .from(patientInvites)
        .where(
          and(
            eq(patientInvites.organizationId, organizationId),
            eq(patientInvites.patientUserId, patientUserId),
            eq(patientInvites.status, 'pending'),
            gt(patientInvites.expiresAt, now),
          ),
        )
        .orderBy(desc(patientInvites.createdAt))
        .limit(1);
      return pending
        ? { status: 'invited', inviteId: pending.id, expiresAt: iso(pending.expiresAt) }
        : { status: 'not_activated', inviteId: null, expiresAt: null };
    },

    async listPortalLinkedPatients({ organizationId, patientUserIds }) {
      exactOrganization(organizationId);
      if (patientUserIds.length === 0) return [];
      const db = getDrizzle();
      const rows = await db
        .select({ platformUserId: orgEnrollments.platformUserId })
        .from(orgEnrollments)
        .where(
          and(
            eq(orgEnrollments.organizationId, organizationId),
            inArray(orgEnrollments.platformUserId, patientUserIds),
            isNotNull(orgEnrollments.portalActivatedAt),
          ),
        );
      return rows.map((row) => row.platformUserId);
    },

    async createReplacingPending(input) {
      exactOrganization(input.organizationId);
      const db = getDrizzle();
      return db.transaction(async (tx) => {
        const [enrollment] = await tx
          .select({
            id: orgEnrollments.id,
            status: orgEnrollments.status,
            portalActivatedAt: orgEnrollments.portalActivatedAt,
          })
          .from(orgEnrollments)
          .where(
            and(
              eq(orgEnrollments.organizationId, input.organizationId),
              eq(orgEnrollments.platformUserId, input.patientUserId),
            ),
          )
          .for('update')
          .limit(1);
        if (!enrollment) return failure('wrong_org');
        if (enrollment.portalActivatedAt) return failure('already_linked');
        if (enrollment.status !== 'invited' && enrollment.status !== 'active') {
          return failure('inactive_relationship');
        }

        const [previousPending] = await tx
          .select({ id: patientInvites.id })
          .from(patientInvites)
          .where(
            and(
              eq(patientInvites.organizationId, input.organizationId),
              eq(patientInvites.patientUserId, input.patientUserId),
              eq(patientInvites.status, 'pending'),
            ),
          )
          .limit(1);

        await tx
          .update(patientInvites)
          .set({
            status: 'superseded',
            supersededByInviteId: null,
            proofCodeHash: null,
            proofExpiresAt: null,
            updatedAt: new Date().toISOString(),
          })
          .where(
            and(
              eq(patientInvites.organizationId, input.organizationId),
              eq(patientInvites.patientUserId, input.patientUserId),
              eq(patientInvites.status, 'pending'),
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
            recipientBinding: input.recipientBinding,
            expiresAt: input.expiresAt,
            createdByPlatformUserId: input.createdByPlatformUserId,
          })
          .returning();
        if (!created) throw new Error('patient_invite_insert_failed');
        if (previousPending) {
          await tx
            .update(patientInvites)
            .set({ supersededByInviteId: created.id, updatedAt: new Date().toISOString() })
            .where(eq(patientInvites.id, previousPending.id));
        }
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
            status: 'revoked',
            revokedAt: new Date().toISOString(),
            revokedByPlatformUserId,
            proofCodeHash: null,
            proofExpiresAt: null,
            updatedAt: new Date().toISOString(),
          })
          .where(
            and(
              eq(patientInvites.id, inviteId),
              eq(patientInvites.organizationId, organizationId),
              eq(patientInvites.patientUserId, patientUserId),
              eq(patientInvites.status, 'pending'),
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
      if (!row?.ok) return failure(row?.code ?? 'invalid_token');
      const preview = mapPreview(row);
      return preview ? { ok: true, preview } : failure('organization_unavailable');
    },

    async lookupContinuation(continuationHash) {
      const db = getDrizzle();
      const result = await db.execute<PreviewFunctionRow>(sql`
        SELECT ok, code, organization_title, recipient_hint, invite_expires_at
        FROM app.lookup_patient_invite_continuation(${continuationHash})
      `);
      const row = result.rows[0];
      if (!row?.ok) return failure(row?.code ?? 'invalid_continuation');
      const preview = mapPreview(row);
      return preview ? { ok: true, preview } : failure('invalid_continuation');
    },

    async startEmailProof({
      continuationHash,
      emailNormalized,
      codeHash,
      proofExpiresAt,
      authorizationNonce,
      authorizationExpiresEpoch,
      authorizationSignature,
    }) {
      const db = getDrizzle();
      const result = await db.transaction((tx) =>
        tx.execute<FunctionBaseRow>(sql`
          SELECT ok, code
          FROM app.start_patient_invite_email_proof(
            ${continuationHash}, ${emailNormalized}, ${codeHash}, ${proofExpiresAt}::timestamptz,
            ${authorizationNonce}, ${authorizationExpiresEpoch}::bigint, ${authorizationSignature}
          )
        `),
      );
      const row = result.rows[0];
      return row?.ok ? { ok: true } : failure(row?.code ?? 'invalid_continuation');
    },

    async cancelEmailProof({ continuationHash, codeHash }) {
      const db = getDrizzle();
      const result = await db.transaction((tx) =>
        tx.execute<{ cancelled: boolean }>(sql`
          SELECT app.cancel_patient_invite_email_proof(
            ${continuationHash}, ${codeHash}
          ) AS cancelled
        `),
      );
      return result.rows[0]?.cancelled === true;
    },

    async verifyEmailProof({
      continuationHash,
      emailNormalized,
      codeHash,
      authorizationNonce,
      authorizationExpiresEpoch,
      authorizationSignature,
    }) {
      const db = getDrizzle();
      const result = await db.transaction((tx) =>
        tx.execute<FunctionBaseRow>(sql`
          SELECT ok, code
          FROM app.verify_patient_invite_email_proof(
            ${continuationHash}, ${emailNormalized}, ${codeHash},
            ${authorizationNonce}, ${authorizationExpiresEpoch}::bigint, ${authorizationSignature}
          )
        `),
      );
      const row = result.rows[0];
      if (row?.ok) return { ok: true };
      if (
        row?.code === 'invalid_code' ||
        row?.code === 'expired_code' ||
        row?.code === 'too_many_attempts'
      ) {
        return { ok: false, code: row.code };
      }
      return failure(row?.code ?? 'invalid_continuation');
    },

    async redeemEmailProof({ continuationHash, authenticatedPlatformUserId }) {
      if (getCurrentDbPrincipalPlatformUserId() !== authenticatedPlatformUserId) {
        return failure('unproved_identity');
      }
      const db = getDrizzle();
      const result = await db.transaction((tx) =>
        tx.execute<RedeemRow>(sql`
          SELECT ok, code, organization_id
          FROM app.redeem_patient_invite_email(${continuationHash})
        `),
      );
      const row = result.rows[0];
      return row?.ok && row.organization_id
        ? {
            ok: true,
            organizationId: row.organization_id,
          }
        : failure(row?.code ?? 'invalid_continuation');
    },

    async claimUnboundEmailProof({
      continuationHash,
      emailNormalized,
      authorizationNonce,
      authorizationExpiresEpoch,
      authorizationSignature,
    }) {
      const db = getDrizzle();
      const result = await db.transaction((tx) =>
        tx.execute<ClaimRow>(sql`
          SELECT ok, code, organization_id, patient_user_id
          FROM app.claim_unbound_patient_invite_email(
            ${continuationHash}, ${emailNormalized}, ${authorizationNonce},
            ${authorizationExpiresEpoch}::bigint, ${authorizationSignature}
          )
        `),
      );
      const row = result.rows[0];
      return row?.ok && row.organization_id && row.patient_user_id
        ? {
            ok: true,
            organizationId: row.organization_id,
            patientUserId: row.patient_user_id,
          }
        : failure(row?.code ?? 'invalid_continuation');
    },
  };
}
