import { DateTime } from "luxon";
import type { ReminderRule } from "@/modules/reminders/types";
import { countWarmupReminderSlotsInUtcRange } from "@/modules/patient-home/nextReminderOccurrence";
import { omitDisabledInstanceStageItemsForPatientApi } from "@/modules/treatment-program/stage-semantics";
import type { ProgramActionLogPort } from "@/modules/treatment-program/ports";
import type { TreatmentProgramInstanceDetail, TreatmentProgramInstanceSummary } from "@/modules/treatment-program/types";
import type { PatientPracticePort } from "@/modules/patient-practice/ports";
import type { PatientDiaryDaySnapshotInsert } from "../../../db/schema/patientDiarySnapshots";
import { buildDiaryPlanChecklistItemIds } from "./diaryPlanChecklist";

const WARMUP_COMPLETION_SOURCES = new Set(["daily_warmup", "reminder"]);

export function localCalendarDayWindowUtcIso(localYmd: string, iana: string): { start: string; end: string } {
  const start = DateTime.fromISO(`${localYmd}T00:00:00`, { zone: iana });
  if (!start.isValid) throw new Error("invalid_local_ymd_or_tz");
  const end = start.plus({ days: 1 });
  return { start: start.toUTC().toISO()!, end: end.toUTC().toISO()! };
}

function countWarmupCompletionsInWindow(
  listByUserInUtcRange: PatientPracticePort["listByUserInUtcRange"],
  userId: string,
  win: { start: string; end: string },
): Promise<number> {
  return listByUserInUtcRange(userId, win.start, win.end).then((rows) =>
    rows.filter((r) => WARMUP_COMPLETION_SOURCES.has(r.source)).length,
  );
}

export type DoneItemByLocalDate = { localDate: string; itemId: string; instanceId: string };

/** Инстанс с наибольшим числом `done` в календарный день; tie-break — более поздний `updatedAt`. */
export function resolvePrimaryInstanceIdForDiaryDay(
  localYmd: string,
  doneRows: readonly DoneItemByLocalDate[],
  instances: readonly TreatmentProgramInstanceSummary[],
): string | null {
  const dayDone = doneRows.filter((r) => r.localDate === localYmd);
  if (dayDone.length === 0) return null;

  const counts = new Map<string, number>();
  for (const r of dayDone) {
    counts.set(r.instanceId, (counts.get(r.instanceId) ?? 0) + 1);
  }

  const instanceById = new Map(instances.map((i) => [i.id, i] as const));
  let bestId: string | null = null;
  let bestCount = 0;

  for (const [instanceId, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      bestId = instanceId;
      continue;
    }
    if (count === bestCount && bestId) {
      const a = instanceById.get(bestId);
      const b = instanceById.get(instanceId);
      if (b && a && b.updatedAt.localeCompare(a.updatedAt) > 0) {
        bestId = instanceId;
      }
    }
  }

  return bestId;
}

export type CaptureDiaryDayPlanResult = {
  planInstanceId: string | null;
  planItemIds: string[];
  planDoneMask: boolean[];
};

export async function buildDiaryDayPlanFromLog(params: {
  localYmd: string;
  doneRows: readonly DoneItemByLocalDate[];
  instances: readonly TreatmentProgramInstanceSummary[];
  getInstanceForPatient: (userId: string, instanceId: string) => Promise<TreatmentProgramInstanceDetail | null>;
  userId: string;
  /** При promo refresh — принудительно этот instance, если в нём есть done за день. */
  preferInstanceId?: string | null;
}): Promise<CaptureDiaryDayPlanResult> {
  const { localYmd, doneRows, instances, getInstanceForPatient, userId, preferInstanceId } = params;
  const dayDone = doneRows.filter((r) => r.localDate === localYmd);
  const doneItemIds = new Set(dayDone.map((r) => r.itemId));

  if (dayDone.length === 0) {
    return { planInstanceId: null, planItemIds: [], planDoneMask: [] };
  }

  let primaryInstanceId = resolvePrimaryInstanceIdForDiaryDay(localYmd, doneRows, instances);
  if (preferInstanceId && dayDone.some((r) => r.instanceId === preferInstanceId)) {
    primaryInstanceId = preferInstanceId;
  }

  if (primaryInstanceId) {
    const raw = await getInstanceForPatient(userId, primaryInstanceId);
    if (raw) {
      const detail = omitDisabledInstanceStageItemsForPatientApi(raw);
      const planItemIds = buildDiaryPlanChecklistItemIds(detail);
      if (planItemIds.length > 0) {
        const planDoneMask = planItemIds.map((id) => doneItemIds.has(id));
        if (planDoneMask.some(Boolean)) {
          return { planInstanceId: primaryInstanceId, planItemIds, planDoneMask };
        }
      }
    }
  }

  const fallbackIds: string[] = [];
  const seen = new Set<string>();
  for (const r of dayDone) {
    if (seen.has(r.itemId)) continue;
    seen.add(r.itemId);
    fallbackIds.push(r.itemId);
  }
  return {
    planInstanceId: primaryInstanceId,
    planItemIds: fallbackIds,
    planDoneMask: fallbackIds.map(() => true),
  };
}

export type CaptureDiaryDaySnapshotDeps = {
  reminders: { listRulesByUser: (userId: string) => Promise<ReminderRule[]> };
  patientPractice: Pick<PatientPracticePort, "listByUserInUtcRange">;
  programActionLog: ProgramActionLogPort;
  treatmentProgramInstance: {
    listInstancesForPatient: (userId: string) => Promise<TreatmentProgramInstanceSummary[]>;
    getInstanceForPatient: (userId: string, instanceId: string) => Promise<TreatmentProgramInstanceDetail | null>;
  };
};

export type CaptureDiaryDaySnapshotInput = {
  userId: string;
  localYmd: string;
  iana: string;
  rules: ReminderRule[];
  instances: TreatmentProgramInstanceSummary[];
  preferInstanceId?: string | null;
};

export async function captureDiaryDaySnapshot(
  deps: CaptureDiaryDaySnapshotDeps,
  input: CaptureDiaryDaySnapshotInput,
): Promise<PatientDiaryDaySnapshotInsert> {
  const { userId, localYmd, iana, rules, instances, preferInstanceId } = input;
  const win = localCalendarDayWindowUtcIso(localYmd, iana);
  const warmupSlotLimit = countWarmupReminderSlotsInUtcRange(rules, new Date(win.start), new Date(win.end));
  const warmupDoneCount = await countWarmupCompletionsInWindow(
    deps.patientPractice.listByUserInUtcRange,
    userId,
    win,
  );
  const warmupAllDone = warmupSlotLimit > 0 && warmupDoneCount >= warmupSlotLimit;

  const doneRows = await deps.programActionLog.listDoneItemsByLocalDateInWindowForPatient({
    patientUserId: userId,
    windowStartUtcIso: win.start,
    windowEndUtcExclusiveIso: win.end,
    displayIana: iana,
  });

  const plan = await buildDiaryDayPlanFromLog({
    localYmd,
    doneRows,
    instances,
    getInstanceForPatient: deps.treatmentProgramInstance.getInstanceForPatient,
    userId,
    preferInstanceId,
  });

  return {
    platformUserId: userId,
    localDate: localYmd,
    iana,
    warmupSlotLimit,
    warmupDoneCount,
    warmupAllDone,
    planInstanceId: plan.planInstanceId,
    planItemIds: plan.planItemIds,
    planDoneMask: plan.planDoneMask,
  };
}
