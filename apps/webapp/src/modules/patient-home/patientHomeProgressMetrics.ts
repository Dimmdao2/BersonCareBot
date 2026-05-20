import { DateTime } from "luxon";
import type { ReminderRule } from "@/modules/reminders/types";
import type { PatientPracticeCompletionRow } from "@/modules/patient-practice/types";
import { computePracticeStreak } from "@/modules/patient-practice/streakLogic";
import { countReminderIntentSlotsInUtcRange } from "./nextReminderOccurrence";

/** Пауза между отметками программы: всё в пределах 100 мин от первой отметки занятия = одно занятие. */
export const PATIENT_HOME_TRAINING_SESSION_GAP_MINUTES = 100;

export type PatientHomeProgressMetrics = {
  warmupPlanned: number;
  warmupDone: number;
  trainingPlanned: number;
  trainingDone: number;
  streakDays: number;
};

export type PatientHomeProgressDisplay = PatientHomeProgressMetrics & {
  doneTotal: number;
  plannedTotal: number;
};

const WARMUP_DONE_SOURCES = new Set<PatientPracticeCompletionRow["source"]>(["daily_warmup"]);

/** (1) Слоты разминок в расписании на сегодня. */
export function countWarmupPlannedSlotsInUtcRange(
  rules: ReminderRule[],
  rangeStart: Date,
  rangeEnd: Date,
): number {
  return countReminderIntentSlotsInUtcRange(rules, "warmup", rangeStart, rangeEnd);
}

/** (3) Слоты тренировок в расписании на сегодня. */
export function countTrainingPlannedSlotsInUtcRange(
  rules: ReminderRule[],
  rangeStart: Date,
  rangeEnd: Date,
): number {
  return countReminderIntentSlotsInUtcRange(rules, "exercises", rangeStart, rangeEnd);
}

/** (2) Отметки «Выполнено» на страницах разминки дня. */
export function countWarmupDoneToday(rows: readonly PatientPracticeCompletionRow[]): number {
  return rows.filter((r) => WARMUP_DONE_SOURCES.has(r.source)).length;
}

/**
 * (4) Число занятий по отметкам в программе: события в пределах 100 мин от первой отметки занятия — одно занятие.
 */
export function countTrainingSessionsFromDoneTimestamps(isoTimestamps: readonly string[]): number {
  const sorted = isoTimestamps
    .map((iso) => new Date(iso).getTime())
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);
  if (sorted.length === 0) return 0;

  const gapMs = PATIENT_HOME_TRAINING_SESSION_GAP_MINUTES * 60_000;
  let sessions = 1;
  let sessionStart = sorted[0]!;
  for (let i = 1; i < sorted.length; i += 1) {
    const t = sorted[i]!;
    if (t - sessionStart > gapMs) {
      sessions += 1;
      sessionStart = t;
    }
  }
  return sessions;
}

/** (5) Дни подряд с хотя бы одной активностью (разминка дня или отметка в программе). */
export function computePatientHomeActivityStreak(
  activityLocalDates: Set<string>,
  patientDayIana: string,
): number {
  return computePracticeStreak(activityLocalDates, patientDayIana);
}

export function buildPatientHomeProgressDisplay(metrics: PatientHomeProgressMetrics): PatientHomeProgressDisplay {
  return {
    ...metrics,
    doneTotal: metrics.warmupDone + metrics.trainingDone,
    plannedTotal: metrics.warmupPlanned + metrics.trainingPlanned,
  };
}

export function collectActivityLocalDates(params: {
  practiceRows: readonly PatientPracticeCompletionRow[];
  programDoneDateKeys: readonly string[];
  patientDayIana: string;
}): Set<string> {
  const dates = new Set<string>();
  for (const row of params.practiceRows) {
    if (!WARMUP_DONE_SOURCES.has(row.source)) continue;
    const d = DateTime.fromISO(row.completedAt, { setZone: true }).setZone(params.patientDayIana).toISODate();
    if (d) dates.add(d);
  }
  for (const key of params.programDoneDateKeys) {
    const normalized = key.trim();
    if (normalized) dates.add(normalized);
  }
  return dates;
}
