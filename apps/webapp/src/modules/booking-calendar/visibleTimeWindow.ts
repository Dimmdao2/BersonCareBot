import { DateTime } from "luxon";
import type { CalendarEvent } from "@/modules/booking-calendar/types";

export const DEFAULT_CALENDAR_WINDOW_MIN = 9 * 60;
export const DEFAULT_CALENDAR_WINDOW_MAX = 19 * 60;

export type CalendarVisibleWindowEvent = Pick<CalendarEvent, "kind" | "startAt" | "endAt">;

export type CalendarVisibleWindowBounds = {
  minMinute: number;
  maxMinute: number;
} | null | undefined;

function minuteToHHMM(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

function parseCalendarInstant(value: string, zone: string): DateTime {
  const iso = DateTime.fromISO(value, { setZone: true });
  if (iso.isValid) return iso.setZone(zone);
  const sql = DateTime.fromSQL(value, { setZone: true });
  if (sql.isValid) return sql.setZone(zone);
  return DateTime.fromJSDate(new Date(value)).setZone(zone);
}

export function deriveCalendarVisibleTimeWindow(
  workingBounds: CalendarVisibleWindowBounds,
  events: CalendarVisibleWindowEvent[] | undefined,
  timeZone: string,
  defaultWindow: { startMinute: number; endMinute: number } = {
    startMinute: DEFAULT_CALENDAR_WINDOW_MIN,
    endMinute: DEFAULT_CALENDAR_WINDOW_MAX,
  },
): { slotMinTime: string; slotMaxTime: string; loMinute: number; hiMinute: number } {
  const defaultLo = Math.max(0, Math.min(1439, defaultWindow.startMinute));
  const defaultHi = Math.max(defaultLo + 30, Math.min(24 * 60, defaultWindow.endMinute));
  let lo = defaultLo;
  let hi = defaultHi;

  if (workingBounds) {
    lo = Math.min(lo, workingBounds.minMinute);
    hi = Math.max(hi, workingBounds.maxMinute);
  }

  for (const event of events ?? []) {
    if (event.kind !== "appointment" && event.kind !== "block") continue;
    const start = parseCalendarInstant(event.startAt, timeZone);
    const end = parseCalendarInstant(event.endAt, timeZone);
    if (start.isValid) {
      lo = Math.min(lo, Math.max(0, start.hour * 60 + start.minute - 60));
    }
    if (end.isValid) {
      let endMinute = end.hour * 60 + end.minute + 60;
      if (endMinute === 0) endMinute = 24 * 60;
      hi = Math.max(hi, Math.min(24 * 60, endMinute));
    }
  }

  lo = Math.max(0, lo);
  hi = Math.min(24 * 60, hi);

  return {
    slotMinTime: minuteToHHMM(lo),
    slotMaxTime: minuteToHHMM(hi),
    loMinute: lo,
    hiMinute: hi,
  };
}
