import { DateTime } from "luxon";

/** Ответ GET `/api/patient/treatment-program-instances/.../passage-stats`. */
export type PatientPlanPassageStats = {
  /** Число календарных дней от дня назначения до конца окна (включительно), минимум 1. */
  calendarDaysInWindow: number;
  /** Различные календарные дни с хотя бы одной отметкой `done` в окне. */
  daysWithActivity: number;
  /** calendarDaysInWindow минус daysWithActivity (не ниже 0). */
  missedDays: number;
  /** Сумма событий выполнения по экземпляру / calendarDaysInWindow, 1 знак после запятой. */
  avgCompletionsPerDay: number;
  /** Пункты пациентского чеклиста сейчас (как {@link buildPatientProgramChecklistRows}), ни разу не завершённые по журналу. */
  neverCompletedChecklistItemCount: number;
};

/**
 * Индекс календарного дня относительно дня назначения: 0 — день `createdAt`, 1 — следующий и т.д.
 * Для UI «первые три дня»: показывать заглушку при значении 0, 1 или 2.
 */
export function calendarDayIndexSinceInstanceCreated(
  createdAtIso: string,
  nowMs: number,
  displayIana: string,
): number {
  const created = DateTime.fromISO(createdAtIso, { zone: "utc" }).setZone(displayIana).startOf("day");
  const today = DateTime.fromMillis(nowMs, { zone: "utc" }).setZone(displayIana).startOf("day");
  if (!created.isValid || !today.isValid) return 0;
  return Math.max(0, Math.floor(today.diff(created, "days").days));
}

export function resolvePatientPlanPassageWindowUtc(params: {
  createdAtIso: string;
  endAnchorIso: string;
  displayIana: string;
}): {
  windowStartUtcIso: string;
  windowEndUtcExclusiveIso: string;
  calendarDaysInWindow: number;
} {
  const { createdAtIso, endAnchorIso, displayIana } = params;
  let windowStartLocal = DateTime.fromISO(createdAtIso, { zone: "utc" }).setZone(displayIana).startOf("day");
  let windowEndLocal = DateTime.fromISO(endAnchorIso, { zone: "utc" }).setZone(displayIana).startOf("day");
  if (!windowStartLocal.isValid) {
    windowStartLocal = DateTime.fromMillis(0, { zone: "utc" }).setZone(displayIana).startOf("day");
  }
  if (!windowEndLocal.isValid) {
    windowEndLocal = windowStartLocal;
  }
  if (windowEndLocal < windowStartLocal) {
    windowEndLocal = windowStartLocal;
  }
  const calendarDaysInWindow = Math.max(1, Math.floor(windowEndLocal.diff(windowStartLocal, "days").days) + 1);
  return {
    windowStartUtcIso: windowStartLocal.toUTC().toISO()!,
    windowEndUtcExclusiveIso: windowEndLocal.plus({ days: 1 }).toUTC().toISO()!,
    calendarDaysInWindow,
  };
}
