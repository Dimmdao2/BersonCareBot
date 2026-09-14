import { and, desc, eq, like, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDrizzle } from '@/app-layer/db/drizzle';
import { getPool } from '@/infra/db/client';
import {
  getWebappSqlDb,
  getWebappSqlFromPgClient,
  runWebappNamedRoot,
  runWebappSql,
} from '@/infra/db/runWebappSql';
import { withTwoUserLifecycleLocksExclusive } from '@/infra/userLifecycleLock';
import { mergePlatformUsersInTransaction } from '@/infra/repos/pgPlatformUserMerge';
import { MergeDependentConflictError } from '@/infra/repos/platformUserMergeErrors';
import { patientMergeCandidates } from '../../../db/schema/patientMergeCandidate';
import type {
  PatientMergeCandidatePort,
  PatientMergeCandidateRecord,
} from '@/modules/patient-merge-candidate/ports';

const medicalConflictPartySchema = z.object({
  userId: z.string().uuid(),
  displayName: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  patronymic: z.string().nullable(),
  lastActivityAt: z.string().nullable(),
  assignments: z.array(
    z.object({
      id: z.string().uuid(),
      kind: z.enum(['treatment_program', 'lfk_assignment']),
      title: z.string(),
      assignedAt: z.string(),
      status: z.string(),
    }),
  ),
});

const medicalConflictDetailsSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  createdAt: z.string(),
  source: z.string(),
  parties: z.tuple([medicalConflictPartySchema, medicalConflictPartySchema]),
});

function medicalMergeReason(reason: string): 'projection' | 'phone_bind' | 'email_bind' {
  const source = reason.slice('medical_history:'.length);
  if (source === 'projection' || source === 'phone_bind' || source === 'email_bind') return source;
  throw new Error('Unsupported medical merge conflict source');
}

function mapRow(row: typeof patientMergeCandidates.$inferSelect): PatientMergeCandidateRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    anchorUserId: row.anchorUserId,
    candidateUserId: row.candidateUserId,
    reason: row.reason,
    status: row.status as PatientMergeCandidateRecord['status'],
    triggerAppointmentId: row.triggerAppointmentId,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt,
    resolvedBy: row.resolvedBy,
  };
}

export async function recordPatientMedicalMergeConflict(
  error: MergeDependentConflictError,
  source: 'projection' | 'phone_bind' | 'email_bind',
): Promise<string> {
  if (!error.organizationId || error.candidateIds.length !== 2) {
    throw new Error('Medical merge conflict is missing its organization or account pair');
  }
  const [anchorUserId, candidateUserId] = error.candidateIds;
  const result = await runWebappNamedRoot<{ conflict_id: string }>(
    getWebappSqlDb(),
    'app.record_patient_medical_merge_conflict(uuid,uuid,uuid,text)',
    [error.organizationId, anchorUserId, candidateUserId, source],
    sql`SELECT app.record_patient_medical_merge_conflict(
          ${error.organizationId}::uuid,
          ${anchorUserId}::uuid,
          ${candidateUserId}::uuid,
          ${source}::text
        )::text AS conflict_id`,
  );
  const conflictId = result.rows[0]?.conflict_id;
  if (!conflictId) throw new Error('Medical merge conflict was not recorded');
  return conflictId;
}

export function createPgPatientMergeCandidatePort(): PatientMergeCandidatePort {
  return {
    async upsertPendingCandidate(input) {
      const db = getDrizzle();
      const existing = await db
        .select()
        .from(patientMergeCandidates)
        .where(
          and(
            eq(patientMergeCandidates.organizationId, input.organizationId),
            eq(patientMergeCandidates.anchorUserId, input.anchorUserId),
            eq(patientMergeCandidates.candidateUserId, input.candidateUserId),
            eq(patientMergeCandidates.status, 'pending'),
          ),
        )
        .limit(1);
      if (existing[0]) {
        return mapRow(existing[0]);
      }
      const inserted = await db
        .insert(patientMergeCandidates)
        .values({
          organizationId: input.organizationId,
          anchorUserId: input.anchorUserId,
          candidateUserId: input.candidateUserId,
          reason: input.reason,
          status: 'pending',
          triggerAppointmentId: input.triggerAppointmentId ?? null,
          payload: input.payload ?? {},
        })
        .returning();
      return mapRow(inserted[0]!);
    },

    async listPendingByOrganization(organizationId, limit = 100) {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(patientMergeCandidates)
        .where(
          and(
            eq(patientMergeCandidates.organizationId, organizationId),
            eq(patientMergeCandidates.status, 'pending'),
          ),
        )
        .orderBy(desc(patientMergeCandidates.createdAt))
        .limit(limit);
      return rows.map(mapRow);
    },

    async listPendingMedicalByOrganization(organizationId) {
      const rows = await getDrizzle()
        .select()
        .from(patientMergeCandidates)
        .where(
          and(
            eq(patientMergeCandidates.organizationId, organizationId),
            eq(patientMergeCandidates.status, 'pending'),
            like(patientMergeCandidates.reason, 'medical_history:%'),
          ),
        )
        .orderBy(desc(patientMergeCandidates.createdAt));
      return rows.map(mapRow);
    },

    async readMedicalConflictDetails(organizationId, conflictId) {
      const result = await runWebappNamedRoot<{ snapshot: unknown }>(
        getWebappSqlDb(),
        'app.read_staff_patient_medical_merge_conflict(uuid)',
        [conflictId],
        sql`SELECT app.read_staff_patient_medical_merge_conflict(${conflictId}::uuid) AS snapshot`,
      );
      const snapshot = result.rows[0]?.snapshot;
      if (snapshot == null) return null;
      const parsed = medicalConflictDetailsSchema.safeParse(snapshot);
      if (!parsed.success || parsed.data.organizationId !== organizationId) {
        throw new Error('Invalid medical merge conflict snapshot');
      }
      return parsed.data;
    },

    async mergeMedicalConflict(organizationId, conflictId, resolvedBy) {
      const rows = await getDrizzle()
        .select()
        .from(patientMergeCandidates)
        .where(
          and(
            eq(patientMergeCandidates.id, conflictId),
            eq(patientMergeCandidates.organizationId, organizationId),
            eq(patientMergeCandidates.status, 'pending'),
            like(patientMergeCandidates.reason, 'medical_history:%'),
          ),
        )
        .limit(1);
      const candidate = rows[0];
      if (!candidate) return false;

      await withTwoUserLifecycleLocksExclusive(
        getPool(),
        candidate.anchorUserId,
        candidate.candidateUserId,
        async (client) => {
          await mergePlatformUsersInTransaction(
            client,
            candidate.anchorUserId,
            candidate.candidateUserId,
            medicalMergeReason(candidate.reason),
            {
              medicalConflictApprovedForOrganizationId: organizationId,
              mergeContext: { actorId: resolvedBy, source: 'doctor_medical_conflict_review' },
            },
          );
          const resolved = await runWebappSql<{ id: string }>(
            getWebappSqlFromPgClient(client),
            sql`UPDATE patient_merge_candidates
                   SET status = 'resolved', resolved_at = now(), resolved_by = ${resolvedBy}::uuid
                 WHERE id = ${conflictId}::uuid
                   AND organization_id = ${organizationId}::uuid
                   AND status = 'pending'
                 RETURNING id::text`,
          );
          if (resolved.rows.length !== 1) {
            throw new Error('Medical merge conflict changed during resolution');
          }
        },
      );
      return true;
    },

    async refuseMedicalConflict(organizationId, conflictId, resolvedBy) {
      const result = await runWebappNamedRoot<{ resolved: boolean }>(
        getWebappSqlDb(),
        'app.refuse_staff_patient_medical_merge_conflict(uuid,uuid)',
        [conflictId, resolvedBy],
        sql`SELECT app.refuse_staff_patient_medical_merge_conflict(
              ${conflictId}::uuid, ${resolvedBy}::uuid
            ) AS resolved`,
      );
      return result.rows[0]?.resolved === true;
    },

    async dismissCandidate(id, resolvedBy) {
      const db = getDrizzle();
      const now = new Date().toISOString();
      const updated = await db
        .update(patientMergeCandidates)
        .set({ status: 'dismissed', resolvedAt: now, resolvedBy })
        .where(and(eq(patientMergeCandidates.id, id), eq(patientMergeCandidates.status, 'pending')))
        .returning({ id: patientMergeCandidates.id });
      return updated.length > 0;
    },

    async markResolvedForUserPair(organizationId, anchorUserId, candidateUserId, resolvedBy) {
      const db = getDrizzle();
      const now = new Date().toISOString();
      const updated = await db
        .update(patientMergeCandidates)
        .set({ status: 'resolved', resolvedAt: now, resolvedBy })
        .where(
          and(
            eq(patientMergeCandidates.status, 'pending'),
            eq(patientMergeCandidates.organizationId, organizationId),
            or(
              and(
                eq(patientMergeCandidates.anchorUserId, anchorUserId),
                eq(patientMergeCandidates.candidateUserId, candidateUserId),
              ),
              and(
                eq(patientMergeCandidates.anchorUserId, candidateUserId),
                eq(patientMergeCandidates.candidateUserId, anchorUserId),
              ),
            ),
          ),
        )
        .returning({ id: patientMergeCandidates.id });
      return updated.length;
    },
  };
}
