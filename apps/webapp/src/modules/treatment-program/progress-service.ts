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
  TreatmentProgramTestAttemptBrief,
  TreatmentProgramTestResultDetailRow,
  TreatmentProgramTestResultRow,
  TreatmentProgramTestAttemptRow,
} from "./types";
import { testIdsFromTestSetSnapshot } from "./testSetSnapshotView";

export { testIdsFromTestSetSnapshot };

/** RSC/API: детализация отправленных попыток (результаты по каждой) для истории в UI. */
export type PatientTestSetSubmittedAttemptDetail = {
  attemptId: string;
  submittedAt: string | null;
  acceptedAt: string | null;
  results: TreatmentProgramTestResultRow[];
};

/** RSC: начальное состояние формы набора тестов без клиентских fetch. */
export type PatientTestSetPageServerSnapshot =
  | { variant: "none" }
  | {
      variant: "open_attempt";
      attemptId: string | null;
      results: TreatmentProgramTestResultRow[];
      attemptHistory: TreatmentProgramTestAttemptBrief[];
      /** Отправленные ранее попытки (не текущая открытая), от новой к старой. */
      submittedAttemptsDetail: PatientTestSetSubmittedAttemptDetail[];
    }
  | {
      variant: "readonly_submitted";
      focalAttemptId: string;
      results: TreatmentProgramTestResultRow[];
      attemptHistory: TreatmentProgramTestAttemptBrief[];
      /** Пункт отмечен врачом (`acceptAttempt`) — до «Новой попытки» нельзя снова редактировать. */
      doctorAcceptedItem: boolean;
      submittedAttemptsDetail: PatientTestSetSubmittedAttemptDetail[];
    };

function attemptHistoryBrief(rows: TreatmentProgramTestAttemptRow[]): TreatmentProgramTestAttemptBrief[] {
  const ordered = orderAttemptsForPatientHistory(rows);
  return ordered.map((a) => ({
    id: a.id,
    startedAt: a.startedAt,
    submittedAt: a.submittedAt,
    acceptedAt: a.acceptedAt,
  }));
}

/** Открытая попытка выше в списке; иначе по времени отправки / старта (новые сверху). */
function orderAttemptsForPatientHistory(rows: TreatmentProgramTestAttemptRow[]): TreatmentProgramTestAttemptRow[] {
  return [...rows].sort((a, b) => {
    const aOpen = a.submittedAt == null ? 1 : 0;
    const bOpen = b.submittedAt == null ? 1 : 0;
    if (aOpen !== bOpen) return bOpen - aOpen;
    const ta = a.submittedAt ?? a.startedAt;
    const tb = b.submittedAt ?? b.startedAt;
    const c = tb.localeCompare(ta);
    if (c !== 0) return c;
    return b.startedAt.localeCompare(a.startedAt);
  });
}

function sortSubmittedAttemptsNewestFirst(rows: TreatmentProgramTestAttemptRow[]): TreatmentProgramTestAttemptRow[] {
  return [...rows].filter((a) => a.submittedAt != null).sort((a, b) => {
    const c = (b.submittedAt ?? "").localeCompare(a.submittedAt ?? "");
    if (c !== 0) return c;
    return b.startedAt.localeCompare(a.startedAt);
  });
}

async function loadSubmittedAttemptDetails(
  tests: TreatmentProgramTestAttemptsPort,
  submittedRows: TreatmentProgramTestAttemptRow[],
): Promise<PatientTestSetSubmittedAttemptDetail[]> {
  const sorted = sortSubmittedAttemptsNewestFirst(submittedRows);
  return Promise.all(
    sorted.map(async (a) => ({
      attemptId: a.id,
      submittedAt: a.submittedAt,
      acceptedAt: a.acceptedAt,
      results: await tests.listResultsForAttempt(a.id),
    })),
  );
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
  actionLog: ProgramActionLogPort;
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
      if (item.itemType === "clinical_test") {
        throw new Error("Для клинического теста используйте отправку результатов");
      }
      const hadCompleted = item.completedAt != null;
      const ts = nowIso();
      const row = await instances.setStageItemCompletedAt(input.instanceId, item.id, ts);
      if (!row) throw new Error("Не удалось сохранить");
      await actionLog.insertAction({
        instanceId: input.instanceId,
        instanceStageItemId: item.id,
        patientUserId: input.patientUserId,
        actionType: "done",
        sessionId: null,
        payload: { source: "simple_item_complete", itemType: item.itemType },
        note: null,
      });
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
      if (item.itemType !== "clinical_test") throw new Error("Элемент не является клиническим тестом");
      const open = await tests.findOpenAttempt(item.id, input.patientUserId);
      if (open) return open;
      const prior = await tests.listAttemptsForStageItem(item.id, input.patientUserId, 5);
      if (prior.length === 0) {
        return tests.createAttempt({ stageItemId: item.id, patientUserId: input.patientUserId });
      }
      throw new Error("Сначала начните новую попытку");
    },

    async patientStartNewTestAttempt(input: {
      patientUserId: string;
      instanceId: string;
      stageItemId: string;
    }): Promise<TreatmentProgramTestAttemptRow> {
      assertUuid(input.patientUserId);
      assertUuid(input.instanceId);
      assertUuid(input.stageItemId);
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
      if (item.itemType !== "clinical_test") throw new Error("Элемент не является клиническим тестом");
      const open = await tests.findOpenAttempt(item.id, input.patientUserId);
      if (open) throw new Error("Сначала отправьте текущую попытку");
      const attempts = await tests.listAttemptsForStageItem(item.id, input.patientUserId, 50);
      const submittedRows = attempts.filter((a) => a.submittedAt != null);
      const last = sortSubmittedAttemptsNewestFirst(submittedRows)[0];
      if (!last || !last.submittedAt) {
        throw new Error("Сначала отправьте набор тестов");
      }
      await tests.clearAcceptanceOnAllAttemptsForStageItemPatient(item.id, input.patientUserId);
      await instances.setStageItemCompletedAt(input.instanceId, item.id, null);
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
      if (item.itemType !== "clinical_test") throw new Error("Элемент не является клиническим тестом");

      const expectedTests = testIdsFromTestSetSnapshot(item.snapshot);
      if (!expectedTests.includes(input.testId)) {
        throw new Error("Тест не соответствует пункту программы");
      }

      let attempt = await tests.findOpenAttempt(item.id, input.patientUserId);
      if (!attempt) {
        const prior = await tests.listAttemptsForStageItem(item.id, input.patientUserId, 1);
        if (prior.length === 0) {
          attempt = await tests.createAttempt({
            stageItemId: item.id,
            patientUserId: input.patientUserId,
          });
        } else {
          throw new Error("Сначала начните попытку");
        }
      }

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
        await tests.markAttemptSubmitted(attempt.id);
        await appendEv({
          instanceId: input.instanceId,
          actorId: input.patientUserId,
          eventType: "status_changed",
          targetType: "stage_item",
          targetId: item.id,
          payload: {
            scope: "stage_item",
            stageId: stage.id,
            context: "clinical_test_attempt_submitted",
            attemptId: attempt.id,
          },
        });
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

    async doctorAcceptTestAttempt(input: { instanceId: string; attemptId: string; doctorUserId: string }) {
      assertUuid(input.instanceId);
      assertUuid(input.attemptId);
      assertUuid(input.doctorUserId);
      await tests.acceptAttempt({
        attemptId: input.attemptId,
        instanceId: input.instanceId,
        doctorUserId: input.doctorUserId,
      });
    },

    listTestResultsForInstance(instanceId: string): Promise<TreatmentProgramTestResultDetailRow[]> {
      assertUuid(instanceId);
      return tests.listResultDetailsForInstance(instanceId);
    },

    listProgramActionLogForInstance(instanceId: string): Promise<ProgramActionLogListRow[]> {
      assertUuid(instanceId);
      return actionLog.listForInstance({ instanceId, limit: 200 });
    },

    async listPendingTestEvaluationsForPatient(patientUserId: string): Promise<PendingProgramTestEvaluationRow[]> {
      assertUuid(patientUserId);
      return tests.listPendingEvaluationResultsForPatient(patientUserId);
    },

    async getPatientTestSetPageServerSnapshot(input: {
      patientUserId: string;
      instanceId: string;
      stageItemId: string;
    }): Promise<PatientTestSetPageServerSnapshot> {
      assertUuid(input.patientUserId);
      assertUuid(input.instanceId);
      assertUuid(input.stageItemId);
      const detail = await instances.getInstanceForPatient(input.patientUserId, input.instanceId);
      if (!detail) return { variant: "none" };
      let item: ReturnType<typeof resolveItemAndStage>["item"];
      try {
        item = resolveItemAndStage(detail, input.stageItemId).item;
      } catch {
        return { variant: "none" };
      }
      if (item.itemType !== "clinical_test") return { variant: "none" };

      const attempts = await tests.listAttemptsForStageItem(input.stageItemId, input.patientUserId, 40);
      const history = attemptHistoryBrief(attempts);
      const open = attempts.find((a) => a.submittedAt === null) ?? null;
      const submittedRows = attempts.filter((a) => a.submittedAt != null);
      const submittedAttemptsDetail = await loadSubmittedAttemptDetails(tests, submittedRows);

      if (open) {
        const results = await tests.listResultsForAttempt(open.id);
        return {
          variant: "open_attempt",
          attemptId: open.id,
          results,
          attemptHistory: history,
          submittedAttemptsDetail,
        };
      }
      const latestRow = sortSubmittedAttemptsNewestFirst(submittedRows)[0];
      if (!latestRow) {
        return {
          variant: "open_attempt",
          attemptId: null,
          results: [],
          attemptHistory: history,
          submittedAttemptsDetail: [],
        };
      }
      const latestBundle = submittedAttemptsDetail.find((d) => d.attemptId === latestRow.id);
      const results = latestBundle?.results ?? (await tests.listResultsForAttempt(latestRow.id));
      return {
        variant: "readonly_submitted",
        focalAttemptId: latestRow.id,
        results,
        attemptHistory: history,
        doctorAcceptedItem: item.completedAt != null,
        submittedAttemptsDetail,
      };
    },
  };
}

export type TreatmentProgramProgressService = ReturnType<typeof createTreatmentProgramProgressService>;
