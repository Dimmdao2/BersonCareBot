import { DateTime } from "luxon";
import type { ChecklistTodaySnapshot } from "@/modules/treatment-program/patient-program-actions";
import type { PatientPracticeCompletionRow } from "@/modules/patient-practice/types";

/** Источники отметки разминки (разминка дня и напоминание на раздел). */
export const PATIENT_HOME_WARMUP_COMPLETION_SOURCES = new Set<PatientPracticeCompletionRow["source"]>([
  "daily_warmup",
  "reminder",
]);

export type PatientHomeProgressGoalBreakdown = {
  warmupDone: number;
  warmupPlanned: number;
  lfkDone: number;
  lfkPlanned: number;
};

export function countWarmupCompletionsInRows(rows: readonly PatientPracticeCompletionRow[]): number {
  return rows.filter((r) => PATIENT_HOME_WARMUP_COMPLETION_SOURCES.has(r.source)).length;
}

export function countProgramChecklistItemsDoneToday(snap: ChecklistTodaySnapshot): number {
  return snap.doneItemIds.length;
}

export function computePatientHomeTodayDoneCount(params: {
  warmupCompletionsToday: number;
  programChecklistDoneToday: number;
}): number {
  return params.warmupCompletionsToday + params.programChecklistDoneToday;
}

export function buildPatientHomeProgressGoalBreakdown(params: {
  warmupDone: number;
  warmupPlanned: number;
  programDone: number;
  lfkPlanned: number;
}): PatientHomeProgressGoalBreakdown | null {
  const { warmupDone, warmupPlanned, programDone, lfkPlanned } = params;
  if (warmupPlanned <= 0 && lfkPlanned <= 0) return null;
  const lfkDone = lfkPlanned > 0 ? Math.min(programDone, lfkPlanned) : programDone;
  return { warmupDone, warmupPlanned, lfkDone, lfkPlanned };
}

/** UTC-окно [start, end) для календарного дня в IANA. */
export function patientHomeLocalDayUtcWindow(localYmd: string, iana: string): { start: Date; end: Date } {
  const start = DateTime.fromISO(`${localYmd}T00:00:00`, { zone: iana });
  if (!start.isValid) throw new Error("invalid_local_ymd_or_tz");
  const end = start.plus({ days: 1 });
  return { start: start.toUTC().toJSDate(), end: end.toUTC().toJSDate() };
}
