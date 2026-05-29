import { and, desc, eq, or } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { patientMergeCandidates } from "../../../db/schema/patientMergeCandidate";
import type {
  PatientMergeCandidatePort,
  PatientMergeCandidateRecord,
} from "@/modules/patient-merge-candidate/ports";

function mapRow(row: typeof patientMergeCandidates.$inferSelect): PatientMergeCandidateRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    anchorUserId: row.anchorUserId,
    candidateUserId: row.candidateUserId,
    reason: row.reason,
    status: row.status as PatientMergeCandidateRecord["status"],
    triggerAppointmentId: row.triggerAppointmentId,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt,
    resolvedBy: row.resolvedBy,
  };
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
            eq(patientMergeCandidates.anchorUserId, input.anchorUserId),
            eq(patientMergeCandidates.candidateUserId, input.candidateUserId),
            eq(patientMergeCandidates.status, "pending"),
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
          status: "pending",
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
            eq(patientMergeCandidates.status, "pending"),
          ),
        )
        .orderBy(desc(patientMergeCandidates.createdAt))
        .limit(limit);
      return rows.map(mapRow);
    },

    async dismissCandidate(id, resolvedBy) {
      const db = getDrizzle();
      const now = new Date().toISOString();
      const updated = await db
        .update(patientMergeCandidates)
        .set({ status: "dismissed", resolvedAt: now, resolvedBy })
        .where(and(eq(patientMergeCandidates.id, id), eq(patientMergeCandidates.status, "pending")))
        .returning({ id: patientMergeCandidates.id });
      return updated.length > 0;
    },

    async markResolvedForUserPair(anchorUserId, candidateUserId, resolvedBy) {
      const db = getDrizzle();
      const now = new Date().toISOString();
      const updated = await db
        .update(patientMergeCandidates)
        .set({ status: "resolved", resolvedAt: now, resolvedBy })
        .where(
          and(
            eq(patientMergeCandidates.status, "pending"),
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
