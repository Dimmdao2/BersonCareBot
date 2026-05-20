import { DateTime } from "luxon";
import type { PatientDiaryDaySnapshotRow } from "../../../db/schema/patientDiarySnapshots";

export function snapshotDayHasPlanOrWarmupActivity(snap: PatientDiaryDaySnapshotRow): boolean {
  if (snap.warmupDoneCount > 0) return true;
  return snap.planDoneMask.some(Boolean);
}

export function countPlanCompletionsInSnapshot(snap: PatientDiaryDaySnapshotRow): number {
  return snap.planDoneMask.filter(Boolean).length;
}

/** Локальные даты yyyy-MM-dd с активностью по снимкам в полуинтервале [start, end). */
export function localDatesWithActivityFromSnapshots(
  snapshots: readonly PatientDiaryDaySnapshotRow[],
  windowStartLocalYmd: string,
  windowEndLocalYmdInclusive: string,
): Set<string> {
  const out = new Set<string>();
  for (const snap of snapshots) {
    if (snap.localDate < windowStartLocalYmd || snap.localDate > windowEndLocalYmdInclusive) continue;
    if (snapshotDayHasPlanOrWarmupActivity(snap)) out.add(snap.localDate);
  }
  return out;
}

export function aggregatePassageStatsFromSnapshots(params: {
  snapshots: readonly PatientDiaryDaySnapshotRow[];
  calendarDaysInWindow: number;
  windowStartLocalYmd: string;
  windowEndLocalYmdInclusive: string;
  /** Дни без снимка, но с `done` в journal (patient-wide). */
  logActivityLocalDates?: ReadonlySet<string>;
}): {
  daysWithActivity: number;
  missedDays: number;
  avgCompletionsPerDay: number;
  totalPlanCompletionsInWindow: number;
} {
  const { snapshots, calendarDaysInWindow, windowStartLocalYmd, windowEndLocalYmdInclusive, logActivityLocalDates } =
    params;

  const activeDates = localDatesWithActivityFromSnapshots(
    snapshots,
    windowStartLocalYmd,
    windowEndLocalYmdInclusive,
  );
  if (logActivityLocalDates) {
    for (const d of logActivityLocalDates) {
      if (d >= windowStartLocalYmd && d <= windowEndLocalYmdInclusive) activeDates.add(d);
    }
  }

  let totalPlanCompletions = 0;
  for (const snap of snapshots) {
    if (snap.localDate < windowStartLocalYmd || snap.localDate > windowEndLocalYmdInclusive) continue;
    totalPlanCompletions += countPlanCompletionsInSnapshot(snap);
  }

  const daysWithActivity = activeDates.size;
  const missedDays = Math.max(0, calendarDaysInWindow - daysWithActivity);
  const avgCompletionsPerDay =
    calendarDaysInWindow > 0 ? Math.round((totalPlanCompletions / calendarDaysInWindow) * 10) / 10 : 0;

  return {
    daysWithActivity,
    missedDays,
    avgCompletionsPerDay,
    totalPlanCompletionsInWindow: totalPlanCompletions,
  };
}

/** Есть ли у пациента снимки/активность раньше дня создания текущего инстанса. */
export function hasPriorDiaryActivityBeforeInstance(
  snapshots: readonly PatientDiaryDaySnapshotRow[],
  instanceCreatedAtIso: string,
  displayIana: string,
): boolean {
  const createdDay = DateTime.fromISO(instanceCreatedAtIso, { zone: "utc" }).setZone(displayIana).startOf("day");
  if (!createdDay.isValid) return false;
  const createdYmd = createdDay.toISODate();
  if (!createdYmd) return false;
  for (const snap of snapshots) {
    if (snap.localDate >= createdYmd) continue;
    if (snapshotDayHasPlanOrWarmupActivity(snap)) return true;
  }
  return false;
}
