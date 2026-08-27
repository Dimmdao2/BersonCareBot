import { DateTime } from 'luxon';
import type { CalendarEvent } from '@/modules/booking-calendar/types';

export const DEFAULT_CALENDAR_WINDOW_MIN = 9 * 60;

export type CalendarVisibleWindowEvent = Pick<CalendarEvent, 'kind' | 'startAt' | 'endAt'>;

export type CalendarVisibleWindowBounds =
  | {
      minMinute: number;
      maxMinute: number;
    }
  | null
  | undefined;

function minuteToHHMM(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

function parseCalendarInstant(value: string, zone: string): DateTime {
  const iso = DateTime.fromISO(value, { setZone: true });
  if (iso.isValid) return iso.setZone(zone);
  const sql = DateTime.fromSQL(value, { setZone: true });
  if (sql.isValid) return sql.setZone(zone);
  return DateTime.fromJSDate(new Date(value)).setZone(zone);
}

export function deriveCalendarInitialScrollTime(
  workingBounds: CalendarVisibleWindowBounds,
  events: CalendarVisibleWindowEvent[] | undefined,
  timeZone: string,
): string {
  let firstRelevantMinute = workingBounds
    ? Math.max(0, Math.min(24 * 60 - 1, workingBounds.minMinute))
    : null;

  for (const event of events ?? []) {
    if (event.kind !== 'appointment' && event.kind !== 'block') continue;
    const start = parseCalendarInstant(event.startAt, timeZone);
    if (start.isValid) {
      const eventMinute = Math.max(0, start.hour * 60 + start.minute - 60);
      firstRelevantMinute =
        firstRelevantMinute === null
          ? eventMinute
          : Math.min(firstRelevantMinute, eventMinute);
    }
  }

  return minuteToHHMM(firstRelevantMinute ?? DEFAULT_CALENDAR_WINDOW_MIN);
}
