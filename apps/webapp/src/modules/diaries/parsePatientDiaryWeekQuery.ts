import { DateTime } from "luxon";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Парсит `?week=YYYY-MM-DD` (любой день) → понедельник той же ISO-недели в {@link iana}.
 * Невалидное значение → null.
 */
export function mondayFromPatientDiaryWeekQuery(weekParam: string | undefined, iana: string): DateTime | null {
  if (weekParam == null) return null;
  const trimmed = weekParam.trim();
  if (!YMD.test(trimmed)) return null;
  const d = DateTime.fromISO(trimmed, { zone: iana });
  if (!d.isValid) return null;
  return d.startOf("week");
}

/** Не позже начала текущей календарной недели в зоне пациента. */
export function clampDiaryWeekStartNotAfterCurrent(monday: DateTime, nowInZone: DateTime): DateTime {
  const curStart = nowInZone.startOf("week");
  if (monday > curStart) return curStart;
  return monday;
}
