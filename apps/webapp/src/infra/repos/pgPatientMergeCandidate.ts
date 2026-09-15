import { and, desc, eq, like, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { runWithDbBootstrapPrincipal } from '@bersoncare/db-principal';
import { getDrizzle } from '@/app-layer/db/drizzle';
import { getPool } from '@/infra/db/client';
import {
  getWebappSqlDb,
  runWebappNamedRoot,
} from '@/infra/db/runWebappSql';
import { withTwoUserLifecycleLocksExclusive } from '@/infra/userLifecycleLock';
import { mergePlatformUsersInTransaction } from '@/infra/repos/pgPlatformUserMerge';
import { MergeDependentConflictError } from '@/infra/repos/platformUserMergeErrors';
import { patientMergeCandidates } from '../../../db/schema/patientMergeCandidate';
import type {
  PatientMergeCandidatePort,
  PatientMergeCandidateRecord,
  PatientMergeConflictMergeOutcome,
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
  doctorApproved: z.boolean(),
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
): Promise<string | null> {
  if (error.kind !== 'medical_history') return null;
  if (error.candidateIds.length !== 2) {
    throw new Error('Medical merge conflict is missing its account pair');
  }
  const [anchorUserId, candidateUserId] = error.candidateIds;
  const organizationIds = [
    ...new Set(error.organizationIds.length > 0 ? error.organizationIds : [error.organizationId]),
  ];
  let firstConflictId: string | null = null;
  for (const organizationId of organizationIds) {
    const result = await runWithDbBootstrapPrincipal(
      { source: 'patient-medical-merge-conflict/record' },
      () =>
        runWebappNamedRoot<{ conflict_id: string }>(
          getWebappSqlDb(),
          'app.record_patient_medical_merge_conflict(uuid,uuid,uuid,text)',
          [organizationId, anchorUserId, candidateUserId, source],
          sql`SELECT app.record_patient_medical_merge_conflict(
                ${organizationId}::uuid,
                ${anchorUserId}::uuid,
                ${candidateUserId}::uuid,
                ${source}::text
              )::text AS conflict_id`,
        ),
    );
    const conflictId = result.rows[0]?.conflict_id;
    if (!conflictId) throw new Error('Medical merge conflict was not recorded');
    firstConflictId ??= conflictId;
  }
  return firstConflictId;
}

export function createPgPatientMergeCandidatePort(): PatientMergeCandidatePort {
  return {
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
      if (!candidate) return 'conflict_not_found';

      // Исход двери передаётся наверх как есть: слияние могло не состояться из-за блокера второй
      // клиники, и тогда врачу нельзя отвечать успехом.
      let outcome: PatientMergeConflictMergeOutcome = 'conflict_not_found';
      await withTwoUserLifecycleLocksExclusive(
        getPool(),
        candidate.anchorUserId,
        candidate.candidateUserId,
        async (client) => {
          const merged = await mergePlatformUsersInTransaction(
            client,
            candidate.anchorUserId,
            candidate.candidateUserId,
            medicalMergeReason(candidate.reason),
            {
              medicalConflictApproval: {
                conflictId,
                organizationId,
                actorId: resolvedBy,
              },
              mergeContext: { actorId: resolvedBy, source: 'doctor_medical_conflict_review' },
            },
          );
          outcome = merged.mergeOutcome;
        },
      );
      return outcome;
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
