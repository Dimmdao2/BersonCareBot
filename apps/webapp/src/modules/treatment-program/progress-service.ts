import type {
  TreatmentProgramEventsPort,
  TreatmentProgramInstancePort,
  TreatmentProgramTestAttemptsPort,
  ProgramActionLogPort,
} from "./ports";
import { buildAppendEventInput, normalizeEventReason } from "./event-recording";
import { assertUuid } from "./service";
import { inferNormalizedDecisionFromScoring, scoringConfigIsQualitative } from "./progress-scoring";
import {
  isCompletableForStageProgress,
  isInstanceStageItemActiveForPatient,
  isPersistentRecommendation,
  isStageZero,
} from "./stage-semantics";
import type {
  NormalizedTestDecision,
  PendingProgramTestEvaluationRow,
  ProgramActionLogListRow,
  TreatmentProgramInstanceDetail,
  TreatmentProgramInstanceStageRow,
  TreatmentProgramInstanceStageStatus,
  TreatmentProgramTestResultDetailRow,
} from "./types";

export function testIdsFromTestSetSnapshot(snapshot: Record<string, unknown>): string[] {
  const tests = snapshot.tests;
  if (!Array.isArray(tests)) return [];
  const ids: string[] = [];
  for (const t of tests) {
    if (t && typeof t === "object" && "testId" in t) {
      const tid = (t as { testId: unknown }).testId;
      if (typeof tid === "string" && tid.trim()) ids.push(tid.trim());
    }
  }
  return ids;
}

function scoringConfigForTestInSnapshot(
  snapshot: Record<string, unknown>,
  testId: string,
): unknown {
  const tests = snapshot.tests;
  if (!Array.isArray(tests)) return null;
  for (const t of tests) {
    if (t && typeof t === "object" && "testId" in t && (t as { testId: string }).testId === testId) {
      return (t as { scoringConfig?: unknown }).scoringConfig ?? null;
    }
  }
  return null;
}

export function createTreatmentProgramProgressService(deps: {
  instances: TreatmentProgramInstancePort;
  tests: TreatmentProgramTestAttemptsPort;
  events?: TreatmentProgramEventsPort;
  actionLog?: ProgramActionLogPort;
  now?: () => string;
}) {
  const { instances, tests } = deps;
  const events = deps.events;
  const actionLog = deps.actionLog;
  const nowIso = deps.now ?? (() => new Date().toISOString());

  async function appendEv(params: Parameters<typeof buildAppendEventInput>[0]): Promise<void> {
    if (!events) return;
    await events.appendEvent(buildAppendEventInput(params));
  }

  async function recordStageStatusChange(params: {
    instanceId: string;
    stageId: string;
    beforeStatus: string;
    afterRow: TreatmentProgramInstanceStageRow;
    actorId: string | null;
    doctorReason?: string | null;
  }): Promise<void> {
    const { instanceId, stageId, beforeStatus, afterRow, actorId, doctorReason } = params;
    const after = afterRow.status;
    if (beforeStatus === after) return;
    if (after === "skipped") {
      const reason = normalizeEventReason("stage_skipped", doctorReason ?? afterRow.skipReason);
      await appendEv({
        instanceId,
        actorId,
        eventType: "stage_skipped",
        targetType: "stage",
        targetId: stageId,
        reason,
        payload: { from: beforeStatus, to: after },
      });
      return;
    }
    if (after === "completed" && beforeStatus !== "completed") {
      await appendEv({
        instanceId,
        actorId,
        eventType: "stage_completed",
        targetType: "stage",
        targetId: stageId,
        payload: { from: beforeStatus, to: after },
      });
      return;
    }
    await appendEv({
      instanceId,
      actorId,
      eventType: "status_changed",
      targetType: "stage",
      targetId: stageId,
      payload: { scope: "stage", from: beforeStatus, to: after },
    });
  }

  async function maybeCompleteStageFromItems(instanceId: string, stageId: string): Promise<void> {
    const detail = await instances.getInstanceById(instanceId);
    if (!detail) return;
    const stage = detail.stages.find((s) => s.id === stageId);
    if (!stage || stage.status === "skipped" || stage.status === "completed") return;
    if (isStageZero(stage)) return;
    const required = stage.items.filter((i) => isCompletableForStageProgress(i));
    if (required.length === 0) return;
    if (!required.every((i) => i.completedAt != null)) return;
    const beforeStatus = stage.status;
    const updated = await instances.updateInstanceStage(instanceId, stageId, { status: "completed" });
    if (updated) {
      await recordStageStatusChange({
        instanceId,
        stageId,
        beforeStatus,
        afterRow: updated,
        actorId: null,
      });
    }
  }

  function resolveItemAndStage(detail: TreatmentProgramInstanceDetail, stageItemId: string) {
    const item = detail.stages.flatMap((s) => s.items).find((i) => i.id === stageItemId);
    if (!item) throw new Error("Элемент не найден");
    const stage = detail.stages.find((s) => s.id === item.stageId);
    if (!stage) throw new Error("Этап не найден");
    return { item, stage };
  }

  function assertStageAccessibleForPatient(stage: { status: string; sortOrder: number }): void {
    if (isStageZero(stage)) return;
    if (stage.status === "locked" || stage.status === "skipped") {
      throw new Error("Этап недоступен");
    }
  }

  async function patientTouchStageItemInner(input: {
    patientUserId: string;
    instanceId: string;
    stageItemId: string;
  }): Promise<TreatmentProgramInstanceDetail> {
    assertUuid(input.patientUserId);
    assertUuid(input.instanceId);
    assertUuid(input.stageItemId);
    const detail = await instances.getInstanceForPatient(input.patientUserId, input.instanceId);
    if (!detail) throw new Error("Программа не найдена");
    const { stage } = resolveItemAndStage(detail, input.stageItemId);
    assertStageAccessibleForPatient(stage);
    if (stage.status === "available") {
      const beforeStatus = stage.status;
      const updated = await instances.updateInstanceStage(input.instanceId, stage.id, {
        status: "in_progress",
      });
      if (updated) {
        await recordStageStatusChange({
          instanceId: input.instanceId,
          stageId: stage.id,
          beforeStatus,
          afterRow: updated,
          actorId: input.patientUserId,
        });
      }
    }
    const next = await instances.getInstanceForPatient(input.patientUserId, input.instanceId);
    if (!next) throw new Error("Программа не найдена");
    return next;
  }

  return {
    async patientTouchStageItem(input: {
      patientUserId: string;
      instanceId: string;
      stageItemId: string;
    }): Promise<TreatmentProgramInstanceDetail> {
      return patientTouchStageItemInner(input);
    },

    async patientCompleteSimpleItem(input: {
      patientUserId: string;
      instanceId: string;
      stageItemId: string;
    }): Promise<TreatmentProgramInstanceDetail> {
      assertUuid(input.patientUserId);
      assertUuid(input.instanceId);
      assertUuid(input.stageItemId);
      await patientTouchStageItemInner(input);
      const detail = await instances.getInstanceForPatient(input.patientUserId, input.instanceId);
      if (!detail) throw new Error("Программа не найдена");
      const { item, stage } = resolveItemAndStage(detail, input.stageItemId);
      assertStageAccessibleForPatient(stage);
      if (!isInstanceStageItemActiveForPatient(item)) {
        throw new Error("Элемент отключён");
      }
      if (isPersistentRecommendation(item)) {
        throw new Error("Постоянная рекомендация не отмечается выполненной");
      }
      if (item.itemType === "test_set") {
        throw new Error("Для набора тестов используйте отправку результатов");
      }
      const hadCompleted = item.completedAt != null;
      const ts = nowIso();
      const row = await instances.setStageItemCompletedAt(input.instanceId, item.id, ts);
      if (!row) throw new Error("Не удалось сохранить");
      if (!hadCompleted) {
        await appendEv({
          instanceId: input.instanceId,
          actorId: input.patientUserId,
          eventType: "status_changed",
          targetType: "stage_item",
          targetId: item.id,
          payload: { scope: "stage_item", field: "completedAt", value: ts, stageId: stage.id },
        });
      }
      await maybeCompleteStageFromItems(input.instanceId, stage.id);
      const out = await instances.getInstanceForPatient(input.patientUserId, input.instanceId);
      if (!out) throw new Error("Программа не найдена");
      return out;
    },

    async patientEnsureTestAttempt(input: {
      patientUserId: string;
      instanceId: string;
      stageItemId: string;
    }) {
      assertUuid(input.patientUserId);
      assertUuid(input.instanceId);
      assertUuid(input.stageItemId);
      await patientTouchStageItemInner(input);
      const detail = await instances.getInstanceForPatient(input.patientUserId, input.instanceId);
      if (!detail) throw new Error("Программа не найдена");
      const { item, stage } = resolveItemAndStage(detail, input.stageItemId);
      assertStageAccessibleForPatient(stage);
      if (!isInstanceStageItemActiveForPatient(item)) {
        throw new Error("Элемент отключён");
      }
      if (item.itemType !== "test_set") throw new Error("Элемент не является набором тестов");
      if (item.completedAt) throw new Error("Набор тестов уже завершён");
      return tests.createAttempt({ stageItemId: item.id, patientUserId: input.patientUserId });
    },

    async patientSubmitTestResult(input: {
      patientUserId: string;
      instanceId: string;
      stageItemId: string;
      testId: string;
      rawValue: Record<string, unknown>;
      normalizedDecision?: NormalizedTestDecision;
    }): Promise<TreatmentProgramInstanceDetail> {
      assertUuid(input.patientUserId);
      assertUuid(input.instanceId);
      assertUuid(input.stageItemId);
      assertUuid(input.testId);
      await patientTouchStageItemInner({
        patientUserId: input.patientUserId,
        instanceId: input.instanceId,
        stageItemId: input.stageItemId,
      });
      const detail = await instances.getInstanceForPatient(input.patientUserId, input.instanceId);
      if (!detail) throw new Error("Программа не найдена");
      const { item, stage } = resolveItemAndStage(detail, input.stageItemId);
      assertStageAccessibleForPatient(stage);
      if (!isInstanceStageItemActiveForPatient(item)) {
        throw new Error("Элемент отключён");
      }
      if (item.itemType !== "test_set") throw new Error("Элемент не является набором тестов");
      if (item.completedAt) throw new Error("Набор тестов уже завершён");

      const expectedTests = testIdsFromTestSetSnapshot(item.snapshot);
      if (!expectedTests.includes(input.testId)) {
        throw new Error("Тест не входит в набор");
      }

      const attempt = await tests.createAttempt({
        stageItemId: item.id,
        patientUserId: input.patientUserId,
      });

      const scoring = scoringConfigForTestInSnapshot(item.snapshot, input.testId);
      const inferred = inferNormalizedDecisionFromScoring(scoring, input.rawValue);
      let decision = input.normalizedDecision ?? inferred;
      if (
        !decision &&
        typeof input.rawValue.score === "number" &&
        !Number.isNaN(input.rawValue.score) &&
        !scoringConfigIsQualitative(scoring)
      ) {
        decision = "partial";
      }
      if (!decision) {
        throw new Error("Укажите итог (passed / failed / partial) или числовой score при настроенных порогах");
      }

      const resultRow = await tests.upsertResult({
        attemptId: attempt.id,
        testId: input.testId,
        rawValue: input.rawValue,
        normalizedDecision: decision,
        decidedBy: null,
      });

      if (actionLog) {
        await actionLog.insertAction({
          instanceId: input.instanceId,
          instanceStageItemId: input.stageItemId,
          patientUserId: input.patientUserId,
          actionType: "done",
          sessionId: null,
          payload: {
            source: "test_submitted",
            testResultId: resultRow.id,
            testId: input.testId,
          },
          note: null,
        });
      }

      await appendEv({
        instanceId: input.instanceId,
        actorId: input.patientUserId,
        eventType: "test_completed",
        targetType: "stage_item",
        targetId: input.stageItemId,
        payload: {
          testResultId: resultRow.id,
          testId: input.testId,
          attemptId: attempt.id,
          normalizedDecision: resultRow.normalizedDecision,
        },
      });

      const existing = await tests.listResultsForAttempt(attempt.id);
      const have = new Set(existing.map((r) => r.testId));
      const allDone = expectedTests.length > 0 && expectedTests.every((tid) => have.has(tid));
      if (allDone) {
        await tests.completeAttempt(attempt.id);
        await instances.setStageItemCompletedAt(input.instanceId, item.id, nowIso());
        await appendEv({
          instanceId: input.instanceId,
          actorId: input.patientUserId,
          eventType: "status_changed",
          targetType: "stage_item",
          targetId: item.id,
          payload: {
            scope: "stage_item",
            field: "completedAt",
            value: nowIso(),
            stageId: stage.id,
            context: "test_set_all_tests_done",
          },
        });
        await maybeCompleteStageFromItems(input.instanceId, stage.id);
      }

      const out = await instances.getInstanceForPatient(input.patientUserId, input.instanceId);
      if (!out) throw new Error("Программа не найдена");
      return out;
    },

    async doctorSetStageStatus(input: {
      instanceId: string;
      stageId: string;
      status: TreatmentProgramInstanceStageStatus;
      reason?: string | null;
      doctorUserId: string | null;
    }): Promise<TreatmentProgramInstanceDetail> {
      assertUuid(input.instanceId);
      assertUuid(input.stageId);
      if (input.doctorUserId) assertUuid(input.doctorUserId);
      if (input.status === "skipped") {
        const r = input.reason?.trim();
        if (!r) throw new Error("Для пропуска этапа укажите причину");
      }
      const detail0 = await instances.getInstanceById(input.instanceId);
      const st0 = detail0?.stages.find((s) => s.id === input.stageId);
      if (!st0) throw new Error("Этап не найден");
      const beforeStatus = st0.status;
      const row = await instances.updateInstanceStage(input.instanceId, input.stageId, {
        status: input.status,
        skipReason: input.status === "skipped" ? input.reason?.trim() ?? null : null,
      });
      if (!row) throw new Error("Этап не найден");
      await recordStageStatusChange({
        instanceId: input.instanceId,
        stageId: input.stageId,
        beforeStatus,
        afterRow: row,
        actorId: input.doctorUserId,
        doctorReason: input.reason,
      });
      const out = await instances.getInstanceById(input.instanceId);
      if (!out) throw new Error("Программа не найдена");
      return out;
    },

    async doctorOverrideTestResult(input: {
      instanceId: string;
      resultId: string;
      doctorUserId: string;
      normalizedDecision: NormalizedTestDecision;
    }) {
      assertUuid(input.instanceId);
      assertUuid(input.resultId);
      assertUuid(input.doctorUserId);
      const inInstance = await tests.listResultDetailsForInstance(input.instanceId);
      if (!inInstance.some((r) => r.id === input.resultId)) {
        throw new Error("Результат не найден");
      }
      const row = await tests.overrideResultDecision(input.resultId, {
        normalizedDecision: input.normalizedDecision,
        decidedBy: input.doctorUserId,
      });
      if (!row) throw new Error("Результат не найден");
      return row;
    },

    listTestResultsForInstance(instanceId: string): Promise<TreatmentProgramTestResultDetailRow[]> {
      assertUuid(instanceId);
      return tests.listResultDetailsForInstance(instanceId);
    },

    listProgramActionLogForInstance(instanceId: string): Promise<ProgramActionLogListRow[]> {
      assertUuid(instanceId);
      if (!actionLog) return Promise.resolve([]);
      return actionLog.listForInstance({ instanceId, limit: 200 });
    },

    async listPendingTestEvaluationsForPatient(patientUserId: string): Promise<PendingProgramTestEvaluationRow[]> {
      assertUuid(patientUserId);
      return tests.listPendingEvaluationResultsForPatient(patientUserId);
    },
  };
}

export type TreatmentProgramProgressService = ReturnType<typeof createTreatmentProgramProgressService>;
