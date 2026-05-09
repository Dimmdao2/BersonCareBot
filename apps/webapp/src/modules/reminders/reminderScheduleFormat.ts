/**
 * Shared HH:MM formatting for reminder window / quiet hours (minutes 0…1440 in a local day).
 * Used by `summarizeReminderForCalendarDay` and list-card schedule summaries.
 */
export function formatReminderMinuteOfDayToHhMm(m: number): string {
  const capped = Math.min(Math.max(0, m), 1440);
  const h = Math.floor(capped / 60)
    .toString()
    .padStart(2, "0");
  const min = (capped % 60).toString().padStart(2, "0");
  return `${h}:${min}`;
}
