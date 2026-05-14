import { and, asc, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { clinicalTests } from "../../../db/schema/clinicalTests";
import {
  treatmentProgramInstances as instanceTable,
  treatmentProgramInstanceStageItems as itemTable,
  treatmentProgramInstanceStages as stageTable,
} from "../../../db/schema/treatmentProgramInstances";
import {
  treatmentProgramTestAttempts as attemptTable,
  treatmentProgramTestResults as resultTable,
} from "../../../db/schema/treatmentProgramTestAttempts";
import type { TreatmentProgramTestAttemptsPort } from "@/modules/treatment-program/ports";
import type {
  TreatmentProgramTestAttemptRow,
  TreatmentProgramTestResultDetailRow,
  TreatmentProgramTestResultRow,
  NormalizedTestDecision,
  PendingProgramTestEvaluationRow,
} from "@/modules/treatment-program/types";

function mapAttempt(row: typeof attemptTable.$inferSelect): TreatmentProgramTestAttemptRow {
  return {
    id: row.id,
    instanceStageItemId: row.instanceStageItemId,
    patientUserId: row.patientUserId,
    startedAt: row.startedAt,
    submittedAt: row.submittedAt ?? null,
    acceptedAt: row.acceptedAt ?? null,
    acceptedBy: row.acceptedBy ?? null,
  };
}

function mapResult(row: typeof resultTable.$inferSelect): TreatmentProgramTestResultRow {
  return {
    id: row.id,
    attemptId: row.attemptId,
    testId: row.testId,
    rawValue: (row.rawValue as Record<string, unknown>) ?? {},
    normalizedDecision: row.normalizedDecision as NormalizedTestDecision,
    decidedBy: row.decidedBy ?? null,
    createdAt: row.createdAt,
  };
}

export function createPgTreatmentProgramTestAttemptsPort(): TreatmentProgramTestAttemptsPort {
  return {
    async findOpenAttempt(stageItemId: string, patientUserId: string) {
      const db = getDrizzle();
      const row = await db.query.treatmentProgramTestAttempts.findFirst({
        where: and(
          eq(attemptTable.instanceStageItemId, stageItemId),
          eq(attemptTable.patientUserId, patientUserId),
          isNull(attemptTable.submittedAt),
        ),
      });
      return row ? mapAttempt(row) : null;
    },

    async createAttempt(input: { stageItemId: string; patientUserId: string }) {
      const db = getDrizzle();
      const existingRow = await db.query.treatmentProgramTestAttempts.findFirst({
        where: and(
          eq(attemptTable.instanceStageItemId, input.stageItemId),
          eq(attemptTable.patientUserId, input.patientUserId),
          isNull(attemptTable.submittedAt),
        ),
      });
      if (existingRow) return mapAttempt(existingRow);
      const [row] = await db
        .insert(attemptTable)
        .values({
          instanceStageItemId: input.stageItemId,
          patientUserId: input.patientUserId,
        })
        .returning();
      if (!row) throw new Error("insert attempt failed");
      return mapAttempt(row);
    },

    async markAttemptSubmitted(attemptId: string) {
      const db = getDrizzle();
      const now = new Date().toISOString();
      const updated = await db
        .update(attemptTable)
        .set({ submittedAt: now })
        .where(and(eq(attemptTable.id, attemptId), isNull(attemptTable.submittedAt)))
        .returning({ id: attemptTable.id });
      return { didTransitionToSubmitted: updated.length > 0 };
    },

    async listAttemptsForStageItem(stageItemId: string, patientUserId: string, limit = 40) {
      const db = getDrizzle();
      const cap = Math.min(Math.max(limit, 1), 100);
      const rows = await db
        .select()
        .from(attemptTable)
        .where(and(eq(attemptTable.instanceStageItemId, stageItemId), eq(attemptTable.patientUserId, patientUserId)))
        .orderBy(desc(attemptTable.startedAt), desc(attemptTable.id))
        .limit(cap);
      return rows.map(mapAttempt);
    },

    async acceptAttempt(input: { attemptId: string; instanceId: string; doctorUserId: string }) {
      const db = getDrizzle();
      const now = new Date().toISOString();
      const errStale = "Нельзя принять неактуальную попытку";
      await db.transaction(async (tx) => {
        const rows = await tx
          .select({
            attempt: attemptTable,
            itemId: itemTable.id,
          })
          .from(attemptTable)
          .innerJoin(itemTable, eq(attemptTable.instanceStageItemId, itemTable.id))
          .innerJoin(stageTable, eq(itemTable.stageId, stageTable.id))
          .where(and(eq(attemptTable.id, input.attemptId), eq(stageTable.instanceId, input.instanceId)))
          .limit(1);
        const hit = rows[0];
        if (!hit) throw new Error("Попытка не найдена");
        if (!hit.attempt.submittedAt) {
          throw new Error("Попытка ещё не отправлена пациентом");
        }

        const ordered = await tx
          .select()
          .from(attemptTable)
          .where(
            and(
              eq(attemptTable.instanceStageItemId, hit.attempt.instanceStageItemId),
              eq(attemptTable.patientUserId, hit.attempt.patientUserId),
            ),
          )
          .orderBy(desc(attemptTable.startedAt), desc(attemptTable.id));
        const H = ordered[0];
        if (!H) throw new Error("Попытка не найдена");
        if (!H.submittedAt) {
          throw new Error(errStale);
        }
        if (H.id !== input.attemptId) {
          throw new Error(errStale);
        }
        if (hit.attempt.acceptedAt != null) {
          return;
        }

        await tx
          .update(attemptTable)
          .set({ acceptedAt: now, acceptedBy: input.doctorUserId })
          .where(eq(attemptTable.id, input.attemptId));
        await tx.update(itemTable).set({ completedAt: now }).where(eq(itemTable.id, hit.itemId));
      });
    },

    async startNewAttemptAfterSubmitted(input: {
      instanceId: string;
      stageItemId: string;
      patientUserId: string;
    }): Promise<TreatmentProgramTestAttemptRow> {
      const db = getDrizzle();
      return db.transaction(async (tx) => {
        const meta = await tx
          .select({ item: itemTable, inst: instanceTable })
          .from(itemTable)
          .innerJoin(stageTable, eq(itemTable.stageId, stageTable.id))
          .innerJoin(instanceTable, eq(stageTable.instanceId, instanceTable.id))
          .where(and(eq(itemTable.id, input.stageItemId), eq(instanceTable.id, input.instanceId)))
          .limit(1);
        const m = meta[0];
        if (!m) throw new Error("Элемент не найден");
        if (m.inst.patientUserId !== input.patientUserId) {
          throw new Error("Элемент не найден");
        }
        if (m.item.itemType !== "clinical_test") {
          throw new Error("Элемент не является клиническим тестом");
        }

        const openRows = await tx
          .select({ id: attemptTable.id })
          .from(attemptTable)
          .where(
            and(
              eq(attemptTable.instanceStageItemId, input.stageItemId),
              eq(attemptTable.patientUserId, input.patientUserId),
              isNull(attemptTable.submittedAt),
            ),
          )
          .limit(1);
        if (openRows.length > 0) {
          throw new Error("Сначала отправьте текущую попытку");
        }

        const anySubmitted = await tx
          .select({ id: attemptTable.id })
          .from(attemptTable)
          .where(
            and(
              eq(attemptTable.instanceStageItemId, input.stageItemId),
              eq(attemptTable.patientUserId, input.patientUserId),
              isNotNull(attemptTable.submittedAt),
            ),
          )
          .limit(1);
        if (anySubmitted.length === 0) {
          throw new Error("Сначала отправьте набор тестов");
        }

        await tx.update(itemTable).set({ completedAt: null }).where(eq(itemTable.id, input.stageItemId));

        const [row] = await tx
          .insert(attemptTable)
          .values({
            instanceStageItemId: input.stageItemId,
            patientUserId: input.patientUserId,
          })
          .returning();
        if (!row) throw new Error("insert attempt failed");
        return mapAttempt(row);
      });
    },

    async upsertResult(input: {
      attemptId: string;
      testId: string;
      rawValue: Record<string, unknown>;
      normalizedDecision: NormalizedTestDecision;
      decidedBy: string | null;
    }) {
      const db = getDrizzle();
      const existing = await db.query.treatmentProgramTestResults.findFirst({
        where: and(eq(resultTable.attemptId, input.attemptId), eq(resultTable.testId, input.testId)),
      });
      if (existing) {
        const [row] = await db
          .update(resultTable)
          .set({
            rawValue: input.rawValue,
            normalizedDecision: input.normalizedDecision,
            decidedBy: input.decidedBy,
          })
          .where(eq(resultTable.id, existing.id))
          .returning();
        return mapResult(row!);
      }
      const [row] = await db
        .insert(resultTable)
        .values({
          attemptId: input.attemptId,
          testId: input.testId,
          rawValue: input.rawValue,
          normalizedDecision: input.normalizedDecision,
          decidedBy: input.decidedBy,
        })
        .returning();
      if (!row) throw new Error("insert result failed");
      return mapResult(row);
    },

    async listResultsForAttempt(attemptId: string) {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(resultTable)
        .where(eq(resultTable.attemptId, attemptId))
        .orderBy(asc(resultTable.createdAt), asc(resultTable.id));
      return rows.map(mapResult);
    },

    async listResultDetailsForInstance(instanceId: string): Promise<TreatmentProgramTestResultDetailRow[]> {
      const db = getDrizzle();
      const rows = await db
        .select({
          result: resultTable,
          instanceStageItemId: attemptTable.instanceStageItemId,
          stageId: stageTable.id,
          stageTitle: stageTable.title,
          stageSortOrder: stageTable.sortOrder,
          testTitle: clinicalTests.title,
          attemptStartedAt: attemptTable.startedAt,
          attemptSubmittedAt: attemptTable.submittedAt,
          attemptAcceptedAt: attemptTable.acceptedAt,
        })
        .from(resultTable)
        .innerJoin(attemptTable, eq(resultTable.attemptId, attemptTable.id))
        .innerJoin(itemTable, eq(attemptTable.instanceStageItemId, itemTable.id))
        .innerJoin(stageTable, eq(itemTable.stageId, stageTable.id))
        .innerJoin(clinicalTests, eq(resultTable.testId, clinicalTests.id))
        .where(eq(stageTable.instanceId, instanceId))
        .orderBy(desc(resultTable.createdAt), asc(resultTable.id));

      return rows.map((r) => ({
        ...mapResult(r.result),
        instanceStageItemId: r.instanceStageItemId,
        stageId: r.stageId,
        stageTitle: r.stageTitle,
        stageSortOrder: r.stageSortOrder,
        testTitle: r.testTitle ?? null,
        attemptStartedAt: r.attemptStartedAt,
        attemptSubmittedAt: r.attemptSubmittedAt ?? null,
        attemptAcceptedAt: r.attemptAcceptedAt ?? null,
      }));
    },

    async listPendingEvaluationResultsForPatient(
      patientUserId: string,
    ): Promise<PendingProgramTestEvaluationRow[]> {
      const db = getDrizzle();
      const rows = await db
        .select({
          attemptId: attemptTable.id,
          attemptSubmittedAt: attemptTable.submittedAt,
          result: resultTable,
          instanceId: instanceTable.id,
          instanceTitle: instanceTable.title,
          stageTitle: stageTable.title,
          instanceStageItemId: attemptTable.instanceStageItemId,
          testTitle: clinicalTests.title,
        })
        .from(resultTable)
        .innerJoin(attemptTable, eq(resultTable.attemptId, attemptTable.id))
        .innerJoin(itemTable, eq(attemptTable.instanceStageItemId, itemTable.id))
        .innerJoin(stageTable, eq(itemTable.stageId, stageTable.id))
        .innerJoin(instanceTable, eq(stageTable.instanceId, instanceTable.id))
        .innerJoin(clinicalTests, eq(resultTable.testId, clinicalTests.id))
        .where(
          and(
            eq(instanceTable.patientUserId, patientUserId),
            eq(instanceTable.status, "active"),
            isNull(resultTable.decidedBy),
            isNotNull(attemptTable.submittedAt),
          ),
        )
        .orderBy(desc(resultTable.createdAt), asc(resultTable.id));

      return rows.map((r) => ({
        attemptId: r.attemptId,
        attemptSubmittedAt: r.attemptSubmittedAt!,
        resultId: r.result.id,
        testId: r.result.testId,
        testTitle: r.testTitle ?? null,
        createdAt: r.result.createdAt,
        instanceId: r.instanceId,
        instanceTitle: r.instanceTitle,
        stageTitle: r.stageTitle,
        stageItemId: r.instanceStageItemId,
      }));
    },

    async overrideResultDecision(
      resultId: string,
      input: { normalizedDecision: NormalizedTestDecision; decidedBy: string },
    ) {
      const db = getDrizzle();
      const [row] = await db
        .update(resultTable)
        .set({
          normalizedDecision: input.normalizedDecision,
          decidedBy: input.decidedBy,
        })
        .where(eq(resultTable.id, resultId))
        .returning();
      return row ? mapResult(row) : null;
    },

    async hasAnyAttemptForStageItem(stageItemId: string) {
      const db = getDrizzle();
      const row = await db.query.treatmentProgramTestAttempts.findFirst({
        where: eq(attemptTable.instanceStageItemId, stageItemId),
      });
      return row != null;
    },
  };
}
