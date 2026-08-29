import { DateTime } from 'luxon';

export const doctorCalendarNonWorkingClassNames = ['doctor-calendar-nonworking'] as const;

export type DoctorCalendarWorkingInterval = {
  startAt: string;
  endAt: string;
};

export type DoctorCalendarBackgroundRange = {
  id: string;
  start: string;
  end: string;
};

/**
 * Returns the complement of working intervals for every visible local date.
 * Calendar screens use the same ranges and the same shared CSS class, while
 * retaining their own FullCalendar orchestration and loading strategy.
 */
export function buildDoctorCalendarNonWorkingRanges(
  workingIntervals: readonly DoctorCalendarWorkingInterval[],
  timeZone: string,
  visibleDayKeys: readonly string[],
  slotMinMinute = 0,
  slotMaxMinute = 24 * 60,
): DoctorCalendarBackgroundRange[] {
  const intervalsByDay = new Map<string, Array<{ startMs: number; endMs: number }>>();

  for (const interval of workingIntervals) {
    const start = DateTime.fromISO(interval.startAt, { setZone: true }).setZone(timeZone);
    const end = DateTime.fromISO(interval.endAt, { setZone: true }).setZone(timeZone);
    const dayKey = start.toISODate();
    if (!start.isValid || !end.isValid || !dayKey) continue;
    const dayIntervals = intervalsByDay.get(dayKey) ?? [];
    dayIntervals.push({ startMs: start.toMillis(), endMs: end.toMillis() });
    intervalsByDay.set(dayKey, dayIntervals);
  }

  for (const dayKey of visibleDayKeys) {
    if (!intervalsByDay.has(dayKey)) intervalsByDay.set(dayKey, []);
  }

  const ranges: DoctorCalendarBackgroundRange[] = [];
  for (const [dayKey, intervals] of intervalsByDay) {
    intervals.sort((left, right) => left.startMs - right.startMs);
    const localDay = DateTime.fromISO(dayKey, { zone: timeZone });
    if (!localDay.isValid) continue;
    const dayStartMs = localDay.plus({ minutes: slotMinMinute }).toMillis();
    const dayEndMs = localDay.plus({ minutes: slotMaxMinute }).toMillis();
    let cursor = dayStartMs;
    let rangeIndex = 0;

    for (const interval of intervals) {
      const intervalStart = Math.max(interval.startMs, dayStartMs);
      const intervalEnd = Math.min(interval.endMs, dayEndMs);
      if (intervalStart > cursor) {
        ranges.push({
          id: `nonwork:${dayKey}:${rangeIndex++}`,
          start: new Date(cursor).toISOString(),
          end: new Date(intervalStart).toISOString(),
        });
      }
      cursor = Math.max(cursor, intervalEnd);
    }

    if (cursor < dayEndMs) {
      ranges.push({
        id: `nonwork:${dayKey}:${rangeIndex}`,
        start: new Date(cursor).toISOString(),
        end: new Date(dayEndMs).toISOString(),
      });
    }
  }

  return ranges;
}

export function formatDoctorCalendarHour(hour: number): string {
  return String(hour).padStart(2, '0');
}
