import { DateTime } from "luxon";

/** Подпись периода «1 мая — 7 мая 2026» (ru, календарная неделя Пн–Вс в зоне {@link iana}). */
export function formatPatientDiaryWeekRangeRu(weekStart: DateTime, iana: string): string {
  const start = weekStart.setZone(iana).setLocale("ru");
  const end = start.plus({ days: 6 });
  if (start.year === end.year) {
    return `${start.toFormat("d MMMM")} — ${end.toFormat("d MMMM yyyy")}`;
  }
  return `${start.toFormat("d MMMM yyyy")} — ${end.toFormat("d MMMM yyyy")}`;
}
