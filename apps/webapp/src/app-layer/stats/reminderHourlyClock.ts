export type HourlyClockSlice = {
  hour: number;
  label: string;
  sent: number;
  failed: number;
};

/** Часы 0–23 в поясе приложения: сумма отправок за последние 24 ч (бакеты из SQL уже локальные). */
export function buildReminderSendsLast24hClock(
  rows: Array<{ bucket: string; sent: number; failed: number }>,
): HourlyClockSlice[] {
  const byHour = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${String(hour).padStart(2, "0")}:00`,
    sent: 0,
    failed: 0,
  }));

  for (const row of rows) {
    const m = row.bucket.trim().match(/(?:T| )(\d{2}):/);
    const h = m ? Number.parseInt(m[1]!, 10) : Number.NaN;
    if (!Number.isFinite(h) || h < 0 || h > 23) continue;
    byHour[h]!.sent += row.sent;
    byHour[h]!.failed += row.failed;
  }

  return byHour;
}
