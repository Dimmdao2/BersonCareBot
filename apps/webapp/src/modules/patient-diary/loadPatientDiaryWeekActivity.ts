import { DateTime } from "luxon";
import type { ReminderRule } from "@/modules/reminders/types";
import { countWarmupReminderSlotsInUtcRange } from "@/modules/patient-home/nextReminderOccurrence";
import { pickActivePlanInstance } from "@/modules/treatment-program/pickActivePlanInstance";
import { omitDisabledInstanceStageItemsForPatientApi } from "@/modules/treatment-program/stage-semantics";
import { buildLivePlanChecklistItemIds } from "@/modules/patient-diary/diaryPlanChecklist";
import type { TreatmentProgramInstanceSummary } from "@/modules/treatment-program/types";
import type { PatientDiarySnapshotsPort } from "./ports";
import type { PatientPracticePort } from "@/modules/patient-practice/ports";
import type { ProgramActionLogPort } from "@/modules/treatment-program/ports";
import {
  captureDiaryDaySnapshot,
  localCalendarDayWindowUtcIso,
  buildDiaryDayPlanFromLog,
  type CaptureDiaryDaySnapshotDeps,
} from "./captureDiaryDaySnapshot";
import type { PatientDiaryDaySnapshotRow } from "../../../db/schema/patientDiarySnapshots";
import { snapshotDayHasPlanOrWarmupActivity } from "./aggregatePassageStatsFromSnapshots";

const WARMUP_COMPLETION_SOURCES = new Set(["daily_warmup", "reminder"]);

function countWarmupCompletionsInWindow(
  listByUserInUtcRange: PatientPracticePort["listByUserInUtcRange"],
  userId: string,
  win: { start: string; end: string },
): Promise<number> {
  return listByUserInUtcRange(userId, win.start, win.end).then((rows) =>
    rows.filter((r) => WARMUP_COMPLETION_SOURCES.has(r.source)).length,
  );
}

export type DiaryWarmupDayModel = {
  localDate: string;
  slotLimit: number;
  doneCount: number;
  allDone: boolean;
} | null;

export type DiaryPlanDayModel = {
  localDate: string;
  items: Array<{ itemId: string; done: boolean }>;
} | null;

export type PatientDiaryWeekActivityModel = {
  warmupDays: DiaryWarmupDayModel[];
  planDays: DiaryPlanDayModel[];
};

export type PatientDiaryWeekActivityDeps = CaptureDiaryDaySnapshotDeps & {
  diarySnapshots: PatientDiarySnapshotsPort;
};

function snapToPlanDay(snap: PatientDiaryDaySnapshotRow): DiaryPlanDayModel {
  return {
    localDate: snap.localDate,
    items: snap.planItemIds.map((itemId, idx) => ({
      itemId,
      done: Boolean(snap.planDoneMask[idx]),
    })),
  };
}

function snapToWarmupDay(snap: PatientDiaryDaySnapshotRow): DiaryWarmupDayModel {
  return {
    localDate: snap.localDate,
    slotLimit: snap.warmupSlotLimit,
    doneCount: snap.warmupDoneCount,
    allDone: snap.warmupAllDone,
  };
}

function hasPlanOrWarmupActivity(plan: DiaryPlanDayModel | null, warmup: DiaryWarmupDayModel | null): boolean {
  if (warmup && (warmup.doneCount > 0 || warmup.allDone)) return true;
  if (plan && plan.items.some((it) => it.done)) return true;
  return false;
}

async function synthesizeWarmupDay(
  deps: PatientDiaryWeekActivityDeps,
  params: { userId: string; localYmd: string; iana: string; rules: ReminderRule[] },
): Promise<DiaryWarmupDayModel> {
  const win = localCalendarDayWindowUtcIso(params.localYmd, params.iana);
  const slotLimit = countWarmupReminderSlotsInUtcRange(params.rules, new Date(win.start), new Date(win.end));
  const doneCount = await countWarmupCompletionsInWindow(
    deps.patientPractice.listByUserInUtcRange,
    params.userId,
    win,
  );
  const allDone = slotLimit > 0 && doneCount >= slotLimit;
  return { localDate: params.localYmd, slotLimit, doneCount, allDone };
}

async function synthesizePlanDay(
  deps: PatientDiaryWeekActivityDeps,
  params: {
    userId: string;
    localYmd: string;
    iana: string;
    instances: TreatmentProgramInstanceSummary[];
  },
): Promise<DiaryPlanDayModel | null> {
  const win = localCalendarDayWindowUtcIso(params.localYmd, params.iana);
  const doneRows = await deps.programActionLog.listDoneItemsByLocalDateInWindowForPatient({
    patientUserId: params.userId,
    windowStartUtcIso: win.start,
    windowEndUtcExclusiveIso: win.end,
    displayIana: params.iana,
  });
  const plan = await buildDiaryDayPlanFromLog({
    localYmd: params.localYmd,
    doneRows,
    instances: params.instances,
    getInstanceForPatient: deps.treatmentProgramInstance.getInstanceForPatient,
    userId: params.userId,
  });
  if (plan.planItemIds.length === 0) return null;
  return {
    localDate: params.localYmd,
    items: plan.planItemIds.map((itemId, idx) => ({
      itemId,
      done: Boolean(plan.planDoneMask[idx]),
    })),
  };
}

/**
 * Прошлый день: снимок immutable, но при занижении plan/warmup — подмешать синтез из journal (без записи в БД).
 */
async function resolvePastDayActivityModels(
  deps: PatientDiaryWeekActivityDeps,
  params: {
    userId: string;
    localYmd: string;
    iana: string;
    rules: ReminderRule[];
    instances: TreatmentProgramInstanceSummary[];
    snap: PatientDiaryDaySnapshotRow | undefined;
  },
): Promise<{ warmup: DiaryWarmupDayModel; plan: DiaryPlanDayModel | null }> {
  const { userId, localYmd, iana, rules, instances, snap } = params;

  if (!snap) {
    const [warmup, plan] = await Promise.all([
      synthesizeWarmupDay(deps, { userId, localYmd, iana, rules }),
      synthesizePlanDay(deps, { userId, localYmd, iana, instances }),
    ]);
    return { warmup, plan };
  }

  let warmup = snapToWarmupDay(snap);
  let plan = snapToPlanDay(snap);

  const planNeedsSynth = !snap.planDoneMask.some(Boolean);
  const warmupNeedsSynth = snap.warmupDoneCount <= 0 && !snap.warmupAllDone;

  if (planNeedsSynth || warmupNeedsSynth) {
    const [synPlan, synWarmup] = await Promise.all([
      planNeedsSynth
        ? synthesizePlanDay(deps, { userId, localYmd, iana, instances })
        : Promise.resolve(plan),
      warmupNeedsSynth
        ? synthesizeWarmupDay(deps, { userId, localYmd, iana, rules })
        : Promise.resolve(warmup),
    ]);
    if (planNeedsSynth && synPlan?.items.some((it) => it.done)) {
      plan = synPlan;
    } else if (planNeedsSynth && synPlan && plan != null && plan.items.length === 0) {
      plan = synPlan;
    }
    if (
      warmupNeedsSynth &&
      synWarmup != null &&
      (synWarmup.doneCount > 0 || synWarmup.allDone)
    ) {
      warmup = synWarmup;
    }
  }

  if (!snapshotDayHasPlanOrWarmupActivity(snap) && !hasPlanOrWarmupActivity(plan, warmup)) {
    const [synWarmup, synPlan] = await Promise.all([
      synthesizeWarmupDay(deps, { userId, localYmd, iana, rules }),
      synthesizePlanDay(deps, { userId, localYmd, iana, instances }),
    ]);
    if (hasPlanOrWarmupActivity(synPlan, synWarmup)) {
      return { warmup: synWarmup, plan: synPlan };
    }
  }

  return { warmup, plan };
}

/**
 * Снимки прошлых дней недели: immutable после записи; capture по patient-wide journal.
 */
async function ensurePastDaySnapshots(
  deps: PatientDiaryWeekActivityDeps,
  params: {
    userId: string;
    iana: string;
    weekStart: DateTime;
    todayYmd: string;
    rules: ReminderRule[];
    instances: TreatmentProgramInstanceSummary[];
  },
): Promise<void> {
  const { userId, iana, weekStart, todayYmd, rules, instances } = params;
  const firstYmd = weekStart.toISODate()!;
  const lastYmd = weekStart.plus({ days: 6 }).toISODate()!;
  const existing = await deps.diarySnapshots.listForUserDateRange(userId, firstYmd, lastYmd);
  const have = new Set(existing.map((r) => r.localDate));

  for (let i = 0; i < 7; i += 1) {
    const day = weekStart.plus({ days: i });
    const ymd = day.toISODate()!;
    if (!ymd || ymd >= todayYmd) continue;
    if (have.has(ymd)) continue;

    const row = await captureDiaryDaySnapshot(deps, {
      userId,
      localYmd: ymd,
      iana,
      rules,
      instances,
    });
    await deps.diarySnapshots.insertIfMissing(row);
  }
}

export async function loadPatientDiaryWeekActivity(
  deps: PatientDiaryWeekActivityDeps,
  params: {
    userId: string;
    weekStartMs: number;
    weekEndMs: number;
    iana: string;
  },
): Promise<PatientDiaryWeekActivityModel> {
  const { userId, weekStartMs, weekEndMs, iana } = params;
  const weekStart = DateTime.fromMillis(weekStartMs, { zone: iana }).startOf("day");
  if (!weekStart.isValid) throw new Error("invalid_week_start");

  const todayYmd = DateTime.now().setZone(iana).toISODate()!;
  if (!todayYmd) throw new Error("invalid_today");

  const [rules, instances] = await Promise.all([
    deps.reminders.listRulesByUser(userId),
    deps.treatmentProgramInstance.listInstancesForPatient(userId),
  ]);
  const planPick = pickActivePlanInstance(instances);

  await ensurePastDaySnapshots(deps, { userId, iana, weekStart, todayYmd, rules, instances });

  const firstYmd = weekStart.toISODate()!;
  const lastYmd = weekStart.plus({ days: 6 }).toISODate()!;
  const snapshots = await deps.diarySnapshots.listForUserDateRange(userId, firstYmd!, lastYmd!);
  const snapBy = new Map(snapshots.map((r) => [r.localDate, r]));

  const weekStartUtcIso = DateTime.fromMillis(weekStartMs, { zone: iana }).startOf("day").toUTC().toISO()!;
  const weekEndUtcExclusiveIso = DateTime.fromMillis(weekEndMs, { zone: iana }).toUTC().toISO()!;

  let donePairsWeek: Array<{ localDate: string; itemId: string }> = [];
  let planItemIdsLive: string[] = [];
  if (planPick) {
    const rawLive = await deps.treatmentProgramInstance.getInstanceForPatient(userId, planPick.id);
    if (rawLive) {
      planItemIdsLive = buildLivePlanChecklistItemIds(omitDisabledInstanceStageItemsForPatientApi(rawLive));
    }
    const doneRows = await deps.programActionLog.listDoneItemsByLocalDateInWindow({
      instanceId: planPick.id,
      patientUserId: userId,
      windowStartUtcIso: weekStartUtcIso,
      windowEndUtcExclusiveIso: weekEndUtcExclusiveIso,
      displayIana: iana,
    });
    donePairsWeek = doneRows;
  }
  const doneByYmd = new Map<string, Set<string>>();
  for (const p of donePairsWeek) {
    const s = doneByYmd.get(p.localDate) ?? new Set();
    s.add(p.itemId);
    doneByYmd.set(p.localDate, s);
  }

  const warmupDays: DiaryWarmupDayModel[] = [];
  const planDays: DiaryPlanDayModel[] = [];

  for (let i = 0; i < 7; i += 1) {
    const day = weekStart.plus({ days: i });
    const ymd = day.toISODate()!;
    if (!ymd) {
      warmupDays.push(null);
      planDays.push(null);
      continue;
    }

    if (ymd < todayYmd) {
      const { warmup, plan } = await resolvePastDayActivityModels(deps, {
        userId,
        localYmd: ymd,
        iana,
        rules,
        instances,
        snap: snapBy.get(ymd),
      });

      if (!hasPlanOrWarmupActivity(plan, warmup)) {
        warmupDays.push(null);
        planDays.push(null);
      } else {
        warmupDays.push(warmup);
        planDays.push(plan);
      }
      continue;
    }

    if (ymd === todayYmd) {
      const win = localCalendarDayWindowUtcIso(ymd, iana);
      const slotLimit = countWarmupReminderSlotsInUtcRange(rules, new Date(win.start), new Date(win.end));
      const doneCount = await countWarmupCompletionsInWindow(deps.patientPractice.listByUserInUtcRange, userId, win);
      const allDone = slotLimit > 0 && doneCount >= slotLimit;
      warmupDays.push({ localDate: ymd, slotLimit, doneCount, allDone });

      const doneSet = doneByYmd.get(ymd) ?? new Set();
      planDays.push({
        localDate: ymd,
        items: planItemIdsLive.map((itemId) => ({ itemId, done: doneSet.has(itemId) })),
      });
      continue;
    }

    warmupDays.push(null);
    planDays.push(null);
  }

  return { warmupDays, planDays };
}
