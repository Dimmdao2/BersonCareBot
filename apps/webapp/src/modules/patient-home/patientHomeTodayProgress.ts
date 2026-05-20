import { DateTime } from "luxon";
import type { ChecklistTodaySnapshot } from "@/modules/treatment-program/patient-program-actions";
import type { PatientPracticeCompletionRow } from "@/modules/patient-practice/types";

/** Источник отметки разминки на главной — только «разминка дня». */
export const PATIENT_HOME_WARMUP_COMPLETION_SOURCES = new Set<PatientPracticeCompletionRow["source"]>([
  "daily_warmup",
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

/** Знаменатель «из N» для блока «Сегодня выполнено». */
export function resolvePatientHomePracticeTarget(params: {
  muted: boolean;
  hasConfiguredHomeLinkedReminders: boolean;
  plannedTotal: number;
  adminPracticeTarget: number;
}): number {
  if (params.muted) return 0;
  if (params.hasConfiguredHomeLinkedReminders) return params.plannedTotal;
  return params.adminPracticeTarget;
}

export type PatientHomeProgressAssembly = {
  todayDone: number;
  practiceTarget: number;
  goalBreakdown: PatientHomeProgressGoalBreakdown | null;
};

export function assemblePatientHomeProgress(params: {
  practiceTarget: number;
  warmupDoneToday: number;
  programDoneToday: number;
  warmupPlanned: number;
  lfkPlanned: number;
  hasConfiguredSchedule: boolean;
  muted: boolean;
  plannedTotal: number;
}): PatientHomeProgressAssembly {
  const useReminderPlan =
    params.hasConfiguredSchedule && !params.muted && params.plannedTotal > 0;

  if (useReminderPlan) {
    const toward = countPatientHomeDoneTowardReminderPlan({
      warmupDoneToday: params.warmupDoneToday,
      programDoneToday: params.programDoneToday,
      warmupPlanned: params.warmupPlanned,
      lfkPlanned: params.lfkPlanned,
    });
    const goalBreakdown = buildPatientHomeProgressGoalBreakdown({
      warmupDone: toward.warmupDone,
      warmupPlanned: params.warmupPlanned,
      lfkDone: toward.lfkDone,
      lfkPlanned: params.lfkPlanned,
    });
    return {
      todayDone: toward.todayDone,
      practiceTarget: params.practiceTarget,
      goalBreakdown,
    };
  }

  const todayDone = computePatientHomeTodayDoneCount({
    warmupCompletionsToday: params.warmupDoneToday,
    programChecklistDoneToday: params.programDoneToday,
  });
  return { todayDone, practiceTarget: params.practiceTarget, goalBreakdown: null };
}

/** aria-label для блока прогресса: совпадает с крупной цифрой на экране. */
export function buildPatientHomeProgressAriaLabel(params: {
  displayDone: number;
  practiceTarget: number;
  showGoal: boolean;
  breakdown: PatientHomeProgressGoalBreakdown | null;
}): string {
  const { displayDone, practiceTarget, showGoal, breakdown } = params;
  const base = showGoal
    ? `Выполнено сегодня: ${displayDone} из ${practiceTarget}`
    : `Выполнено сегодня: ${displayDone}`;
  if (!breakdown) return base;
  const parts = [base];
  if (breakdown.warmupPlanned > 0) {
    parts.push(`Разминки: ${breakdown.warmupDone} из ${breakdown.warmupPlanned}`);
  }
  if (breakdown.lfkPlanned > 0) {
    parts.push(`Тренировки: ${breakdown.lfkDone} из ${breakdown.lfkPlanned}`);
  }
  return `${parts.join(". ")}.`;
}

/** Вклад в «Сегодня выполнено» по слотам напоминаний (не больше плана на день). */
export function countPatientHomeDoneTowardReminderPlan(params: {
  warmupDoneToday: number;
  programDoneToday: number;
  warmupPlanned: number;
  lfkPlanned: number;
}): { warmupDone: number; lfkDone: number; todayDone: number } {
  const warmupDone =
    params.warmupPlanned > 0 ? Math.min(params.warmupDoneToday, params.warmupPlanned) : 0;
  const lfkDone = params.lfkPlanned > 0 ? Math.min(params.programDoneToday, params.lfkPlanned) : 0;
  return { warmupDone, lfkDone, todayDone: warmupDone + lfkDone };
}

export function buildPatientHomeProgressGoalBreakdown(params: {
  warmupDone: number;
  warmupPlanned: number;
  lfkDone: number;
  lfkPlanned: number;
}): PatientHomeProgressGoalBreakdown | null {
  const { warmupDone, warmupPlanned, lfkDone, lfkPlanned } = params;
  if (warmupPlanned <= 0 && lfkPlanned <= 0) return null;
  return { warmupDone, warmupPlanned, lfkDone, lfkPlanned };
}

/** UTC-окно [start, end) для календарного дня в IANA. */
export function patientHomeLocalDayUtcWindow(localYmd: string, iana: string): { start: Date; end: Date } {
  const start = DateTime.fromISO(`${localYmd}T00:00:00`, { zone: iana });
  if (!start.isValid) throw new Error("invalid_local_ymd_or_tz");
  const end = start.plus({ days: 1 });
  return { start: start.toUTC().toJSDate(), end: end.toUTC().toJSDate() };
}
