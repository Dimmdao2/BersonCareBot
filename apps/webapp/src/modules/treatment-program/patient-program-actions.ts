import { DateTime } from "luxon";
import type { ProgramActionLogPort, TreatmentProgramInstancePort } from "./ports";
import { assertUuid } from "./service";
import type {
  TreatmentProgramInstanceDetail,
  TreatmentProgramInstanceStageItemView,
} from "./types";
import type { ProgramItemDiscussionService } from "@/modules/program-item-discussion/service";
import type { ProgramItemDiscussionMessage } from "@/modules/program-item-discussion/types";
import { resolveCalendarDayIanaForPatient } from "@/modules/system-settings/calendarIana";
import {
  isInstanceStageItemActiveForPatient,
  isPersistentRecommendation,
  isStageZero,
} from "./stage-semantics";
import {
  aggregatePassageStatsFromSnapshots,
  earliestLocalDateWithActivityFromSnapshots,
  hasPriorDiaryActivityBeforeInstance,
} from "@/modules/patient-diary/aggregatePassageStatsFromSnapshots";
import type { PatientDiarySnapshotsPort } from "@/modules/patient-diary/ports";
import {
  calendarDayIndexSinceInstanceCreated,
  resolvePatientPlanPassageWindowUtc,
  type PatientPlanPassageStats,
} from "./patient-plan-passage-stats";

export type { PatientPlanPassageStats } from "./patient-plan-passage-stats";

export function utcDayWindowIso(now = new Date()): { start: string; end: string } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  const start = new Date(Date.UTC(y, m, d, 0, 0, 0, 0)).toISOString();
  const end = new Date(Date.UTC(y, m, d + 1, 0, 0, 0, 0)).toISOString();
  return { start, end };
}

/** Сутки в зоне IANA (Luxon, DST-safe); границы в ISO UTC для сравнения с `program_action_log`. */
export function localDayWindowIso(now: Date, iana: string): { start: string; end: string } {
  const dt = DateTime.fromJSDate(now, { zone: "utc" }).setZone(iana);
  if (!dt.isValid) {
    return utcDayWindowIso(now);
  }
  const start = dt.startOf("day");
  const end = start.plus({ days: 1 });
  return { start: start.toUTC().toISO()!, end: end.toUTC().toISO()! };
}

export function isProgramChecklistItem(
  item: Pick<TreatmentProgramInstanceStageItemView, "itemType" | "isActionable" | "status">,
): boolean {
  if (!isInstanceStageItemActiveForPatient(item)) return false;
  if (isPersistentRecommendation(item)) return false;
  if (item.itemType === "clinical_test") return false;
  if (item.itemType === "recommendation" && item.isActionable === false) return false;
  return (
    item.itemType === "exercise" ||
    item.itemType === "lesson" ||
    item.itemType === "recommendation"
  );
}

export function pickStagesForPatientChecklist(detail: TreatmentProgramInstanceDetail) {
  return detail.stages.filter((s) => {
    if (isStageZero(s)) return s.status !== "skipped";
    return s.status === "available" || s.status === "in_progress";
  });
}

export type PatientProgramChecklistRow = {
  stageId: string;
  stageTitle: string;
  stageSortOrder: number;
  groupId: string | null;
  groupTitle: string | null;
  item: TreatmentProgramInstanceStageItemView;
};

export function buildPatientProgramChecklistRows(detail: TreatmentProgramInstanceDetail): PatientProgramChecklistRow[] {
  if (detail.status !== "active") return [];
  const out: PatientProgramChecklistRow[] = [];
  for (const st of pickStagesForPatientChecklist(detail)) {
    const groupsSorted = [...(st.groups ?? [])].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id),
    );
    const groupTitleById = new Map(groupsSorted.map((g) => [g.id, g.title] as const));
    const itemsSorted = [...st.items].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
    for (const item of itemsSorted) {
      if (!isProgramChecklistItem(item)) continue;
      out.push({
        stageId: st.id,
        stageTitle: st.title,
        stageSortOrder: st.sortOrder,
        groupId: item.groupId,
        groupTitle: item.groupId ? (groupTitleById.get(item.groupId) ?? null) : null,
        item,
      });
    }
  }
  out.sort((a, b) => a.stageSortOrder - b.stageSortOrder || a.item.sortOrder - b.item.sortOrder);
  return out;
}

/** Снимок для GET checklist-today: уникальные id с отметкой за день + счётчики и последняя отметка по журналу. */
export type ChecklistTodaySnapshot = {
  doneItemIds: string[];
  doneTodayCountByItemId: Record<string, number>;
  lastDoneAtIsoByItemId: Record<string, string>;
  /** События `done` за всё время экземпляра по элементу (DISTINCT session|row). */
  totalCompletionEventsByItemId: Record<string, number>;
  doneTodayCountByActivityKey: Record<string, number>;
  lastDoneAtIsoByActivityKey: Record<string, string>;
};

export function createTreatmentProgramPatientActionService(deps: {
  instances: TreatmentProgramInstancePort;
  actionLog: ProgramActionLogPort;
  patientDiarySnapshots: PatientDiarySnapshotsPort;
  now?: () => Date;
  getAppDefaultTimezoneIana: () => Promise<string>;
  getPatientCalendarTimezoneIana?: (platformUserId: string) => Promise<string | null>;
  resolvePatientLabel?: (platformUserId: string) => Promise<string>;
  notifyDoctorOfProgramNote?: (input: {
    patientUserId: string;
    instanceId: string;
    stageItemId: string;
    patientLabel: string;
    exerciseTitle: string;
    noteText: string;
  }) => Promise<void>;
  discussion?: Pick<ProgramItemDiscussionService, "appendMessage">;
}) {
  const nowFn = deps.now ?? (() => new Date());
  const getPersonalTz = deps.getPatientCalendarTimezoneIana ?? (async () => null);

  async function checklistDayWindow(patientUserId: string) {
    const appDefault = await deps.getAppDefaultTimezoneIana();
    const personal = await getPersonalTz(patientUserId);
    const iana = resolveCalendarDayIanaForPatient(personal, appDefault);
    return localDayWindowIso(nowFn(), iana);
  }

  async function assertItemAccessible(
    patientUserId: string,
    instanceId: string,
    stageItemId: string,
  ): Promise<{ item: TreatmentProgramInstanceStageItemView }> {
    const detail = await deps.instances.getInstanceForPatient(patientUserId, instanceId);
    if (!detail) throw new Error("Программа не найдена");
    const item = detail.stages.flatMap((s) => s.items).find((i) => i.id === stageItemId);
    if (!item) throw new Error("Элемент не найден");
    const stage = detail.stages.find((s) => s.id === item.stageId);
    if (!stage) throw new Error("Этап не найден");
    if (!isStageZero(stage) && (stage.status === "locked" || stage.status === "skipped")) {
      throw new Error("Этап недоступен");
    }
    if (!isProgramChecklistItem(item)) throw new Error("Элемент недоступен для чек-листа");
    return { item };
  }

  return {
    utcDayWindowIso,
    localDayWindowIso,

    /** ISO-времена всех `done` за сегодня по календарю пациента (для подсчёта занятий на главной). */
    async listProgramDoneTimestampsToday(patientUserId: string, instanceId: string): Promise<string[]> {
      assertUuid(patientUserId);
      assertUuid(instanceId);
      const win = await checklistDayWindow(patientUserId);
      const rows = await deps.actionLog.listForInstance({ instanceId, limit: 500 });
      const out: string[] = [];
      for (const row of rows) {
        if (row.actionType !== "done") continue;
        if (row.createdAt < win.start || row.createdAt >= win.end) continue;
        const src =
          row.payload && typeof row.payload === "object" && "source" in row.payload
            ? String((row.payload as { source?: unknown }).source ?? "")
            : "";
        if (src === "test_submitted" || src === "lfk_exercise_done") continue;
        out.push(row.createdAt);
      }
      return out;
    },

    async listChecklistDoneToday(patientUserId: string, instanceId: string): Promise<ChecklistTodaySnapshot> {
      assertUuid(patientUserId);
      assertUuid(instanceId);
      const detail = await deps.instances.getInstanceForPatient(patientUserId, instanceId);
      if (!detail) throw new Error("Программа не найдена");
      if (detail.status !== "active") {
        return {
          doneItemIds: [],
          doneTodayCountByItemId: {},
          lastDoneAtIsoByItemId: {},
          totalCompletionEventsByItemId: {},
          doneTodayCountByActivityKey: {},
          lastDoneAtIsoByActivityKey: {},
        };
      }
      const win = await checklistDayWindow(patientUserId);
      const params = {
        instanceId,
        patientUserId,
        windowStartIso: win.start,
        windowEndIso: win.end,
      };
      const [
        doneItemIds,
        doneTodayCountByItemId,
        lastDoneAtIsoByItemId,
        totalCompletionEventsByItemId,
        doneTodayCountByActivityKey,
        lastDoneAtIsoByActivityKey,
      ] = await Promise.all([
        deps.actionLog.listDoneItemIdsInWindow(params),
        deps.actionLog.countDoneByItemInWindow(params),
        deps.actionLog.lastDoneAtIsoByItemForInstance({ instanceId, patientUserId }),
        deps.actionLog.countCompletionEventsByItemForInstance({ instanceId, patientUserId }),
        deps.actionLog.countDoneByActivityKeyInWindow(params),
        deps.actionLog.lastDoneAtIsoByActivityKeyForInstance({ instanceId, patientUserId }),
      ]);
      return {
        doneItemIds,
        doneTodayCountByItemId,
        lastDoneAtIsoByItemId,
        totalCompletionEventsByItemId,
        doneTodayCountByActivityKey,
        lastDoneAtIsoByActivityKey,
      };
    },

    async getPatientPlanPassageStats(patientUserId: string, instanceId: string): Promise<PatientPlanPassageStats> {
      assertUuid(patientUserId);
      assertUuid(instanceId);
      const detail = await deps.instances.getInstanceForPatient(patientUserId, instanceId);
      if (!detail) throw new Error("Программа не найдена");

      const appDefault = await deps.getAppDefaultTimezoneIana();
      const personal = await getPersonalTz(patientUserId);
      const iana = resolveCalendarDayIanaForPatient(personal, appDefault);
      const zoneProbe = DateTime.fromJSDate(nowFn()).setZone(iana);
      if (!zoneProbe.isValid) throw new Error("Некорректная временная зона");

      const endAnchorIso = detail.status === "completed" ? detail.updatedAt : nowFn().toISOString();
      const instanceWindow = resolvePatientPlanPassageWindowUtc({
        createdAtIso: detail.createdAt,
        endAnchorIso,
        displayIana: iana,
      });

      let windowStartLocalYmd = DateTime.fromISO(instanceWindow.windowStartUtcIso, { zone: "utc" })
        .setZone(iana)
        .toISODate()!;

      const windowEndYmd =
        DateTime.fromISO(endAnchorIso, { zone: "utc" }).setZone(iana).startOf("day").toISODate() ??
        windowStartLocalYmd;

      const minStoredYmd = await deps.patientDiarySnapshots.minLocalDateForUser(patientUserId);
      const fetchFromYmd =
        minStoredYmd && minStoredYmd < windowStartLocalYmd ? minStoredYmd : windowStartLocalYmd;
      const snapsFetched = await deps.patientDiarySnapshots.listForUserDateRange(
        patientUserId,
        fetchFromYmd,
        windowEndYmd,
      );
      const earliestActiveSnapYmd = earliestLocalDateWithActivityFromSnapshots(snapsFetched);
      if (earliestActiveSnapYmd && earliestActiveSnapYmd < windowStartLocalYmd) {
        windowStartLocalYmd = earliestActiveSnapYmd;
      }

      const windowStartUtcIso = DateTime.fromISO(`${windowStartLocalYmd}T00:00:00`, { zone: iana })
        .toUTC()
        .toISO()!;
      const { calendarDaysInWindow } = resolvePatientPlanPassageWindowUtc({
        createdAtIso: windowStartUtcIso,
        endAnchorIso,
        displayIana: iana,
      });

      const snapshots = snapsFetched.filter(
        (s) => s.localDate >= windowStartLocalYmd && s.localDate <= windowEndYmd,
      );

      const logDateKeys = await deps.actionLog.listDistinctLocalDoneDateKeysInWindowForPatient({
        patientUserId,
        windowStartUtcIso,
        windowEndUtcExclusiveIso: instanceWindow.windowEndUtcExclusiveIso,
        displayIana: iana,
      });
      const snapDates = new Set(snapshots.map((s) => s.localDate));
      const logSupplement = new Set<string>();
      for (const d of logDateKeys) {
        if (!snapDates.has(d)) logSupplement.add(d);
      }

      const aggregated = aggregatePassageStatsFromSnapshots({
        snapshots,
        calendarDaysInWindow,
        windowStartLocalYmd,
        windowEndLocalYmdInclusive: windowEndYmd,
        logActivityLocalDates: logSupplement,
      });

      const totalByItem = await deps.actionLog.countCompletionEventsByItemForInstance({
        instanceId,
        patientUserId,
      });
      const otherInstances = (await deps.instances.listInstancesForPatient(patientUserId)).filter(
        (i) => i.id !== instanceId,
      );
      for (const inst of otherInstances) {
        const part = await deps.actionLog.countCompletionEventsByItemForInstance({
          instanceId: inst.id,
          patientUserId,
        });
        for (const [itemId, n] of Object.entries(part)) {
          totalByItem[itemId] = (totalByItem[itemId] ?? 0) + n;
        }
      }

      const checklistRows = buildPatientProgramChecklistRows(detail);
      let neverCompletedChecklistItemCount = 0;
      for (const row of checklistRows) {
        if ((totalByItem[row.item.id] ?? 0) === 0) neverCompletedChecklistItemCount++;
      }

      const dayIndex = calendarDayIndexSinceInstanceCreated(detail.createdAt, nowFn().getTime(), iana);
      const priorDiary = hasPriorDiaryActivityBeforeInstance(snapshots, detail.createdAt, iana);
      const showCollectingCopy = dayIndex <= 2 && !priorDiary;

      return {
        calendarDaysInWindow,
        daysWithActivity: aggregated.daysWithActivity,
        missedDays: aggregated.missedDays,
        avgCompletionsPerDay: aggregated.avgCompletionsPerDay,
        neverCompletedChecklistItemCount,
        showCollectingCopy,
      };
    },

    /** Локальные даты `done` за последние N дней по всем программам пациента (для агрегатов главной). */
    async listLocalDoneDateKeysForRecentDays(
      patientUserId: string,
      days: number,
    ): Promise<{ iana: string; dateKeys: string[] }> {
      assertUuid(patientUserId);
      const appDefault = await deps.getAppDefaultTimezoneIana();
      const personal = await getPersonalTz(patientUserId);
      const iana = resolveCalendarDayIanaForPatient(personal, appDefault);
      const nowLocal = DateTime.fromJSDate(nowFn()).setZone(iana);
      if (!nowLocal.isValid) {
        throw new Error("Некорректная временная зона");
      }
      const daysClamped = Math.min(Math.max(Math.trunc(days), 1), 400);
      const startLocal = nowLocal.startOf("day").minus({ days: daysClamped - 1 });
      const endLocalExclusive = nowLocal.startOf("day").plus({ days: 1 });
      const dateKeys = await deps.actionLog.listDistinctLocalDoneDateKeysInWindowForPatient({
        patientUserId,
        windowStartUtcIso: startLocal.toUTC().toISO()!,
        windowEndUtcExclusiveIso: endLocalExclusive.toUTC().toISO()!,
        displayIana: iana,
      });
      return { iana, dateKeys };
    },

    async patientToggleChecklistItem(input: {
      patientUserId: string;
      instanceId: string;
      stageItemId: string;
      checked: boolean;
    }): Promise<string[]> {
      assertUuid(input.patientUserId);
      assertUuid(input.instanceId);
      assertUuid(input.stageItemId);
      const { item } = await assertItemAccessible(input.patientUserId, input.instanceId, input.stageItemId);
      const win = await checklistDayWindow(input.patientUserId);
      if (input.checked) {
        await deps.actionLog.insertAction({
          instanceId: input.instanceId,
          instanceStageItemId: input.stageItemId,
          patientUserId: input.patientUserId,
          actionType: "done",
          sessionId: null,
          payload: { source: "checklist_toggle" },
          note: null,
        });
      } else {
        await deps.actionLog.deleteSimpleDoneInWindow({
          instanceId: input.instanceId,
          patientUserId: input.patientUserId,
          instanceStageItemId: input.stageItemId,
          windowStartIso: win.start,
          windowEndIso: win.end,
        });
      }
      return deps.actionLog.listDoneItemIdsInWindow({
        instanceId: input.instanceId,
        patientUserId: input.patientUserId,
        windowStartIso: win.start,
        windowEndIso: win.end,
      });
    },

    /** Свободное наблюдение пациента по пункту (журнал `program_action_log`, `action_type = note`). Не для набора тестов. */
    async patientAppendObservationNote(input: {
      patientUserId: string;
      instanceId: string;
      stageItemId: string;
      note: string;
    }): Promise<ProgramItemDiscussionMessage | null> {
      assertUuid(input.patientUserId);
      assertUuid(input.instanceId);
      assertUuid(input.stageItemId);
      const noteTrim = input.note.trim();
      if (!noteTrim) throw new Error("Введите текст наблюдения");
      const detail = await deps.instances.getInstanceForPatient(input.patientUserId, input.instanceId);
      if (!detail) throw new Error("Программа не найдена");
      const item = detail.stages.flatMap((s) => s.items).find((i) => i.id === input.stageItemId);
      if (!item) throw new Error("Элемент не найден");
      const stage = detail.stages.find((s) => s.id === item.stageId);
      if (!stage) throw new Error("Этап не найден");
      if (!isStageZero(stage) && (stage.status === "locked" || stage.status === "skipped")) {
        throw new Error("Этап недоступен");
      }
      if (!isInstanceStageItemActiveForPatient(item)) {
        throw new Error("Элемент отключён");
      }
      if (detail.assignmentSource === "promo") {
        throw new Error("Комментарии недоступны для промо-программы");
      }
      if (detail.assignmentSource === "course") {
        throw new Error("Комментарии недоступны для программы курса");
      }
      if (item.itemType === "clinical_test") {
        throw new Error("Для клинического теста используйте запись результатов");
      }
      await deps.actionLog.insertAction({
        instanceId: input.instanceId,
        instanceStageItemId: input.stageItemId,
        patientUserId: input.patientUserId,
        actionType: "note",
        sessionId: null,
        payload: { source: "patient_observation" },
        note: noteTrim.slice(0, 4000),
      });
      let savedMessage: ProgramItemDiscussionMessage | null = null;
      if (detail.assignmentSource === "doctor" && deps.discussion) {
        savedMessage = await deps.discussion.appendMessage({
          instanceStageItemId: input.stageItemId,
          patientUserId: input.patientUserId,
          senderRole: "patient",
          origin: "patient_observation",
          body: noteTrim,
        });
      }
      if (detail.assignmentSource === "doctor" && deps.notifyDoctorOfProgramNote && deps.resolvePatientLabel) {
        const snap = item.snapshot as Record<string, unknown>;
        const title =
          typeof snap.title === "string" && snap.title.trim() ? snap.title.trim() : "Пункт программы";
        const notifyInput = {
          patientUserId: input.patientUserId,
          instanceId: input.instanceId,
          stageItemId: input.stageItemId,
          exerciseTitle: title,
          noteText: noteTrim,
        };
        void (async () => {
          const patientLabel = await deps.resolvePatientLabel!(input.patientUserId);
          await deps.notifyDoctorOfProgramNote!({
            ...notifyInput,
            patientLabel,
          });
        })().catch((err: unknown) => {
          console.error("[patient-program-note] notify failed", err);
        });
      }
      return savedMessage;
    },

    /** Медиа пациента по пункту программы (discussion message + журнал). */
    async patientAppendDiscussionMedia(input: {
      patientUserId: string;
      instanceId: string;
      stageItemId: string;
      mediaFileId: string;
    }): Promise<void> {
      assertUuid(input.patientUserId);
      assertUuid(input.instanceId);
      assertUuid(input.stageItemId);
      assertUuid(input.mediaFileId);
      const detail = await deps.instances.getInstanceForPatient(input.patientUserId, input.instanceId);
      if (!detail) throw new Error("Программа не найдена");
      const item = detail.stages.flatMap((s) => s.items).find((i) => i.id === input.stageItemId);
      if (!item) throw new Error("Элемент не найден");
      const stage = detail.stages.find((s) => s.id === item.stageId);
      if (!stage) throw new Error("Этап не найден");
      if (!isStageZero(stage) && (stage.status === "locked" || stage.status === "skipped")) {
        throw new Error("Этап недоступен");
      }
      if (!isInstanceStageItemActiveForPatient(item)) {
        throw new Error("Элемент отключён");
      }
      if (detail.assignmentSource === "promo") {
        throw new Error("Комментарии недоступны для промо-программы");
      }
      if (detail.assignmentSource === "course") {
        throw new Error("Комментарии недоступны для программы курса");
      }
      if (item.itemType === "clinical_test") {
        throw new Error("Для клинического теста используйте запись результатов");
      }
      await deps.actionLog.insertAction({
        instanceId: input.instanceId,
        instanceStageItemId: input.stageItemId,
        patientUserId: input.patientUserId,
        actionType: "note",
        sessionId: null,
        payload: { source: "patient_media", mediaFileId: input.mediaFileId },
        note: null,
      });
      if (detail.assignmentSource === "doctor" && deps.discussion) {
        await deps.discussion.appendMessage({
          instanceStageItemId: input.stageItemId,
          patientUserId: input.patientUserId,
          senderRole: "patient",
          origin: "patient_observation",
          mediaFileId: input.mediaFileId,
        });
      }
      if (detail.assignmentSource === "doctor" && deps.notifyDoctorOfProgramNote && deps.resolvePatientLabel) {
        const snap = item.snapshot as Record<string, unknown>;
        const title =
          typeof snap.title === "string" && snap.title.trim() ? snap.title.trim() : "Пункт программы";
        const notifyInput = {
          patientUserId: input.patientUserId,
          instanceId: input.instanceId,
          stageItemId: input.stageItemId,
          exerciseTitle: title,
          noteText: "Медиафайл",
        };
        void (async () => {
          const patientLabel = await deps.resolvePatientLabel!(input.patientUserId);
          await deps.notifyDoctorOfProgramNote!({
            ...notifyInput,
            patientLabel,
          });
        })().catch((err: unknown) => {
          console.error("[patient-program-note] notify failed", err);
        });
      }
    },
  };
}

export type TreatmentProgramPatientActionService = ReturnType<typeof createTreatmentProgramPatientActionService>;
