import { DateTime } from "luxon";
import { clampIntervalMinutes } from "@/modules/reminders/reminderIntervalBounds";
import { formatReminderMinuteOfDayToHhMm } from "@/modules/reminders/reminderScheduleFormat";
import type { ReminderRule } from "@/modules/reminders/types";
import type { SlotsV1ScheduleData } from "@/modules/reminders/scheduleSlots";

/** Same weekday index as Luxon: Mon=0 … Sun=6 (Luxon weekday 1..7 → minus 1). */
function weekdayIndex0FromLuxonWeekday(weekday: number): number {
  return weekday - 1;
}

function localDateKeyLuxon(dt: DateTime): string {
  return dt.toFormat("yyyy-LL-dd");
}

/**
 * Whether `slots_v1` schedule applies on `day` (interpreted in `tz`).
 * Mirrors `nextReminderOccurrence.ts` `isDayActiveSlotsV1` for consistency.
 */
export function isSlotsV1DayActive(data: SlotsV1ScheduleData, rule: ReminderRule, day: DateTime, tz: string): boolean {
  const weekdayIndex0 = weekdayIndex0FromLuxonWeekday(day.weekday);
  if (data.dayFilter === "weekdays") {
    return weekdayIndex0 >= 0 && weekdayIndex0 <= 4;
  }
  if (data.dayFilter === "weekly_mask") {
    const mask = (data.daysMask ?? rule.daysMask ?? "1111111").padStart(7, "0").slice(0, 7);
    return mask[weekdayIndex0] === "1";
  }
  if (data.dayFilter === "every_n_days") {
    const n = data.everyNDays ?? 1;
    const anchor = (data.anchorDate ?? "").trim();
    if (!anchor || n < 1) return false;
    const todayKey = localDateKeyLuxon(day);
    let diff = 0;
    try {
      const b = DateTime.fromISO(`${todayKey}T12:00:00`, { zone: tz });
      const a = DateTime.fromISO(`${anchor}T12:00:00`, { zone: tz });
      diff = Math.round(b.diff(a, "days").days);
    } catch {
      return false;
    }
    if (diff < 0) return false;
    return diff % n === 0;
  }
  return false;
}

function isIntervalDayActive(rule: ReminderRule, day: DateTime): boolean {
  const mask = rule.daysMask.padStart(7, "0").slice(0, 7);
  const idx = weekdayIndex0FromLuxonWeekday(day.weekday);
  return mask[idx] === "1";
}

export type SummarizeReminderInput = Pick<
  ReminderRule,
  | "enabled"
  | "scheduleType"
  | "scheduleData"
  | "daysMask"
  | "intervalMinutes"
  | "windowStartMinute"
  | "windowEndMinute"
  | "timezone"
>;

/**
 * One-line summary for a calendar date (`calendarDateKey` = yyyy-LL-dd) in `patientCalendarDayIana`,
 * evaluated consistently with home reminder logic: the calendar instant at noon in patient zone is
 * shifted to `rule.timezone` to obtain the local weekday used for masks / weekday filters.
 */
export function summarizeReminderForCalendarDay(
  rule: SummarizeReminderInput,
  calendarDateKey: string,
  patientCalendarDayIana: string,
): string {
  if (!rule.enabled) return "Выключено";

  const ruleTz = rule.timezone?.trim() || "Europe/Moscow";
  const noonPatient = DateTime.fromISO(`${calendarDateKey}T12:00:00`, { zone: patientCalendarDayIana });
  if (!noonPatient.isValid) return "См. расписание";
  const dayInRuleTz = noonPatient.setZone(ruleTz);

  if (rule.scheduleType === "slots_v1" && rule.scheduleData && Array.isArray(rule.scheduleData.timesLocal)) {
    const data = rule.scheduleData;
    if (!isSlotsV1DayActive(data, rule as ReminderRule, dayInRuleTz, ruleTz)) {
      if (data.dayFilter === "every_n_days") return "Сегодня не по графику";
      return "Сегодня без напоминаний";
    }
    const times = data.timesLocal.filter((t) => typeof t === "string" && t.trim()).join(", ");
    return times.length ? times : "См. расписание";
  }

  const interval = clampIntervalMinutes(rule.intervalMinutes ?? 60);
  if (!isIntervalDayActive(rule as ReminderRule, dayInRuleTz)) {
    return "Сегодня выходной по расписанию";
  }
  const ws = rule.windowStartMinute;
  const we = rule.windowEndMinute;
  return `${formatReminderMinuteOfDayToHhMm(ws)}–${formatReminderMinuteOfDayToHhMm(we)}, каждые ${interval} мин.`;
}
