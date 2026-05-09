import { DateTime } from "luxon";
import type { ReminderRule } from "@/modules/reminders/types";
import { countWarmupReminderSlotsInUtcRange } from "@/modules/patient-home/nextReminderOccurrence";
import { pickActivePlanInstance } from "@/modules/treatment-program/pickActivePlanInstance";
import { buildPatientProgramChecklistRows } from "@/modules/treatment-program/patient-program-actions";
import { omitDisabledInstanceStageItemsForPatientApi } from "@/modules/treatment-program/stage-semantics";
import type { TreatmentProgramInstanceDetail, TreatmentProgramInstanceSummary } from "@/modules/treatment-program/types";
import type { PatientDiarySnapshotsPort } from "./ports";
import type { PatientPracticePort } from "@/modules/patient-practice/ports";
import type { ProgramActionLogPort } from "@/modules/treatment-program/ports";

const WARMUP_COMPLETION_SOURCES = new Set(["daily_warmup", "reminder"]);

/** UTC полуинтервал [start,end) для календарного дня `localYmd` в зоне {@link iana}. */
function localCalendarDayWindowUtcIso(localYmd: string, iana: string): { start: string; end: string } {
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

async function orderedChecklistItemIds(
  getInstanceForPatient: (userId: string, instanceId: string) => Promise<TreatmentProgramInstanceDetail>,
  userId: string,
  instanceId: string,
): Promise<string[]> {
  const raw = await getInstanceForPatient(userId, instanceId);
  const detail = omitDisabledInstanceStageItemsForPatientApi(raw);
  return buildPatientProgramChecklistRows(detail).map((r) => r.item.id);
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

export type PatientDiaryWeekActivityDeps = {
  reminders: { listRulesByUser: (userId: string) => Promise<ReminderRule[]> };
  patientPractice: Pick<PatientPracticePort, "listByUserInUtcRange">;
  programActionLog: ProgramActionLogPort;
  treatmentProgramInstance: {
    listForPatient: (userId: string) => Promise<TreatmentProgramInstanceSummary[]>;
    getInstanceForPatient: (userId: string, instanceId: string) => Promise<TreatmentProgramInstanceDetail>;
  };
  diarySnapshots: PatientDiarySnapshotsPort;
};

/**
 * Снимки прошлых дней недели: immutable после записи; поздние `done` не переснимают прошлое (MVP).
 */
async function ensurePastDaySnapshots(
  deps: PatientDiaryWeekActivityDeps,
  params: {
    userId: string;
    iana: string;
    weekStart: DateTime;
    todayYmd: string;
    rules: ReminderRule[];
    planPick: TreatmentProgramInstanceSummary | null;
  },
): Promise<void> {
  const { userId, iana, weekStart, todayYmd, rules, planPick } = params;
  const firstYmd = weekStart.toISODate()!;
  const lastYmd = weekStart.plus({ days: 6 }).toISODate()!;
  const existing = await deps.diarySnapshots.listForUserDateRange(userId, firstYmd, lastYmd);
  const have = new Set(existing.map((r) => r.localDate));

  for (let i = 0; i < 7; i += 1) {
    const day = weekStart.plus({ days: i });
    const ymd = day.toISODate()!;
    if (!ymd || ymd >= todayYmd) continue;
    if (have.has(ymd)) continue;

    const win = localCalendarDayWindowUtcIso(ymd, iana);
    const warmupSlotLimit = countWarmupReminderSlotsInUtcRange(rules, new Date(win.start), new Date(win.end));
    const warmupDoneCount = await countWarmupCompletionsInWindow(deps.patientPractice.listByUserInUtcRange, userId, win);
    const warmupAllDone = warmupSlotLimit > 0 && warmupDoneCount >= warmupSlotLimit;

    let planItemIds: string[] = [];
    let planDoneMask: boolean[] = [];
    let planInstanceId: string | null = null;
    if (planPick) {
      planInstanceId = planPick.id;
      planItemIds = await orderedChecklistItemIds(
        deps.treatmentProgramInstance.getInstanceForPatient,
        userId,
        planPick.id,
      );
      const donePairs = await deps.programActionLog.listDoneItemsByLocalDateInWindow({
        instanceId: planPick.id,
        patientUserId: userId,
        windowStartUtcIso: win.start,
        windowEndUtcExclusiveIso: win.end,
        displayIana: iana,
      });
      const doneSet = new Set(donePairs.filter((p) => p.localDate === ymd).map((p) => p.itemId));
      planDoneMask = planItemIds.map((id) => doneSet.has(id));
    }

    await deps.diarySnapshots.insertIfMissing({
      platformUserId: userId,
      localDate: ymd,
      iana,
      warmupSlotLimit,
      warmupDoneCount,
      warmupAllDone,
      planInstanceId,
      planItemIds,
      planDoneMask,
    });
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
    deps.treatmentProgramInstance.listForPatient(userId),
  ]);
  const planPick = pickActivePlanInstance(instances);

  await ensurePastDaySnapshots(deps, { userId, iana, weekStart, todayYmd, rules, planPick });

  const firstYmd = weekStart.toISODate()!;
  const lastYmd = weekStart.plus({ days: 6 }).toISODate()!;
  const snapshots = await deps.diarySnapshots.listForUserDateRange(userId, firstYmd!, lastYmd!);
  const snapBy = new Map(snapshots.map((r) => [r.localDate, r]));

  const weekStartUtcIso = DateTime.fromMillis(weekStartMs, { zone: iana }).startOf("day").toUTC().toISO()!;
  const weekEndUtcExclusiveIso = DateTime.fromMillis(weekEndMs, { zone: iana }).toUTC().toISO()!;

  let donePairsWeek: Array<{ localDate: string; itemId: string }> = [];
  let planItemIdsLive: string[] = [];
  if (planPick) {
    planItemIdsLive = await orderedChecklistItemIds(
      deps.treatmentProgramInstance.getInstanceForPatient,
      userId,
      planPick.id,
    );
    donePairsWeek = await deps.programActionLog.listDoneItemsByLocalDateInWindow({
      instanceId: planPick.id,
      patientUserId: userId,
      windowStartUtcIso: weekStartUtcIso,
      windowEndUtcExclusiveIso: weekEndUtcExclusiveIso,
      displayIana: iana,
    });
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
      const snap = snapBy.get(ymd);
      if (!snap) {
        warmupDays.push(null);
        planDays.push(null);
        continue;
      }
      warmupDays.push({
        localDate: ymd,
        slotLimit: snap.warmupSlotLimit,
        doneCount: snap.warmupDoneCount,
        allDone: snap.warmupAllDone,
      });
      const items = snap.planItemIds.map((itemId, idx) => ({
        itemId,
        done: Boolean(snap.planDoneMask[idx]),
      }));
      planDays.push({ localDate: ymd, items });
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
