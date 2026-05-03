import { DateTime } from "luxon";
import type { ProgramActionLogPort, TreatmentProgramInstancePort } from "./ports";
import { assertUuid } from "./service";
import type {
  LfkPostSessionDifficulty,
  TreatmentProgramInstanceDetail,
  TreatmentProgramInstanceStageItemView,
} from "./types";
import { resolveCalendarDayIanaForPatient } from "@/modules/system-settings/calendarIana";
import {
  isInstanceStageItemActiveForPatient,
  isPersistentRecommendation,
  isStageZero,
} from "./stage-semantics";

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
  if (item.itemType === "test_set") return false;
  if (item.itemType === "recommendation" && item.isActionable === false) return false;
  return (
    item.itemType === "exercise" ||
    item.itemType === "lfk_complex" ||
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

export function createTreatmentProgramPatientActionService(deps: {
  instances: TreatmentProgramInstancePort;
  actionLog: ProgramActionLogPort;
  now?: () => Date;
  getAppDefaultTimezoneIana: () => Promise<string>;
  getPatientCalendarTimezoneIana?: (platformUserId: string) => Promise<string | null>;
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

    async listChecklistDoneToday(patientUserId: string, instanceId: string): Promise<string[]> {
      assertUuid(patientUserId);
      assertUuid(instanceId);
      const detail = await deps.instances.getInstanceForPatient(patientUserId, instanceId);
      if (!detail) throw new Error("Программа не найдена");
      if (detail.status !== "active") return [];
      const win = await checklistDayWindow(patientUserId);
      return deps.actionLog.listDoneItemIdsInWindow({
        instanceId,
        patientUserId,
        windowStartIso: win.start,
        windowEndIso: win.end,
      });
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
      if (item.itemType === "lfk_complex") {
        throw new Error("ЛФК отмечайте через форму «Как прошло занятие?»");
      }
      const win = await checklistDayWindow(input.patientUserId);
      if (input.checked) {
        const existing = await deps.actionLog.listDoneItemIdsInWindow({
          instanceId: input.instanceId,
          patientUserId: input.patientUserId,
          windowStartIso: win.start,
          windowEndIso: win.end,
        });
        if (!existing.includes(input.stageItemId)) {
          await deps.actionLog.insertAction({
            instanceId: input.instanceId,
            instanceStageItemId: input.stageItemId,
            patientUserId: input.patientUserId,
            actionType: "done",
            sessionId: null,
            payload: null,
            note: null,
          });
        }
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

    async patientSubmitLfkPostSession(input: {
      patientUserId: string;
      instanceId: string;
      stageItemId: string;
      difficulty: LfkPostSessionDifficulty;
      note?: string | null;
    }): Promise<string[]> {
      assertUuid(input.patientUserId);
      assertUuid(input.instanceId);
      assertUuid(input.stageItemId);
      const { item } = await assertItemAccessible(input.patientUserId, input.instanceId, input.stageItemId);
      if (item.itemType !== "lfk_complex") throw new Error("Только для ЛФК-комплекса");
      const win = await checklistDayWindow(input.patientUserId);
      await deps.actionLog.deleteAllDoneInWindow({
        instanceId: input.instanceId,
        patientUserId: input.patientUserId,
        instanceStageItemId: input.stageItemId,
        windowStartIso: win.start,
        windowEndIso: win.end,
      });
      const noteTrim = input.note?.trim() ? input.note.trim().slice(0, 4000) : null;
      const sessionId = crypto.randomUUID();
      await deps.actionLog.insertAction({
        instanceId: input.instanceId,
        instanceStageItemId: input.stageItemId,
        patientUserId: input.patientUserId,
        actionType: "done",
        sessionId,
        payload: { difficulty: input.difficulty, source: "lfk_session" },
        note: noteTrim,
      });
      return deps.actionLog.listDoneItemIdsInWindow({
        instanceId: input.instanceId,
        patientUserId: input.patientUserId,
        windowStartIso: win.start,
        windowEndIso: win.end,
      });
    },
  };
}

export type TreatmentProgramPatientActionService = ReturnType<typeof createTreatmentProgramPatientActionService>;
