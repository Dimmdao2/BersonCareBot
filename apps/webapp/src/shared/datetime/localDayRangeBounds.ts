import { DateTime } from "luxon";

export type LocalCalendarDayRange = "today" | "tomorrow" | "week";

/** Границы интервала в UTC ISO для SQL `timestamptz` (сутки в IANA `app_display_timezone`). */
export function localDayRangeBoundsIso(range: LocalCalendarDayRange, iana: string): { from: string; to: string } {
  const now = DateTime.now().setZone(iana);
  if (range === "today") {
    return {
      from: now.startOf("day").toUTC().toISO()!,
      to: now.endOf("day").toUTC().toISO()!,
    };
  }
  if (range === "tomorrow") {
    const tomorrow = now.plus({ days: 1 });
    return {
      from: tomorrow.startOf("day").toUTC().toISO()!,
      to: tomorrow.endOf("day").toUTC().toISO()!,
    };
  }
  const weekEnd = now.startOf("day").plus({ days: 6 }).endOf("day");
  return {
    from: now.startOf("day").toUTC().toISO()!,
    to: weekEnd.toUTC().toISO()!,
  };
}
