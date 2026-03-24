/**
 * UTC rolling windows for diary stats APIs and {@link loadMiniStatsProps}.
 * End boundary is exclusive (next midnight UTC after the last included day).
 */

export type StatsPeriod = "week" | "month" | "all";

/** Tomorrow 00:00:00.000Z from the given instant's calendar UTC date. */
export function utcNextMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
}

/**
 * Rolling window ending at "today" UTC (inclusive), shifted back by `offset` full periods.
 * - week: 7 days
 * - month: 30 days
 * - all: from 10 years ago to end of today UTC (offset ignored)
 */
export function statsPeriodWindowUtc(
  period: StatsPeriod,
  offset: number
): { fromIso: string; toExclusiveIso: string } {
  const now = new Date();
  const todayEndExclusive = utcNextMidnight(now);

  if (period === "all") {
    const start = new Date();
    start.setUTCFullYear(start.getUTCFullYear() - 10);
    return { fromIso: start.toISOString(), toExclusiveIso: todayEndExclusive.toISOString() };
  }

  const days = period === "week" ? 7 : 30;
  const shift = days * offset;
  const endExclusive = new Date(todayEndExclusive);
  endExclusive.setUTCDate(endExclusive.getUTCDate() - shift);
  const start = new Date(endExclusive);
  start.setUTCDate(start.getUTCDate() - days);
  return { fromIso: start.toISOString(), toExclusiveIso: endExclusive.toISOString() };
}

/** Inclusive UTC calendar days from `fromIso` through day before `toExclusiveIso`. */
export function enumerateUtcDayKeysInWindow(fromIso: string, toExclusiveIso: string): string[] {
  const keys: string[] = [];
  const startDay = fromIso.slice(0, 10);
  const endExclusiveDay = toExclusiveIso.slice(0, 10);
  for (
    let d = new Date(`${startDay}T00:00:00.000Z`);
    d.toISOString().slice(0, 10) < endExclusiveDay;
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    keys.push(d.toISOString().slice(0, 10));
  }
  return keys;
}
