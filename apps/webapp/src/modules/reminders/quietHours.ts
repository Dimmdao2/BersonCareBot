/**
 * Quiet hours: local minute-of-day range in rule timezone.
 * Same-day window: [start, end) when start < end.
 * Overnight wrap: [start, 1440) ∪ [0, end) when start > end.
 * Disabled when either bound is null.
 */
export function isMinuteOfDayInQuietHours(
  minuteOfDay: number,
  quietStart: number | null | undefined,
  quietEnd: number | null | undefined,
): boolean {
  if (quietStart == null || quietEnd == null) return false;
  const s = quietStart;
  const e = quietEnd;
  if (s === e) return false;
  if (s < e) {
    return minuteOfDay >= s && minuteOfDay < e;
  }
  return minuteOfDay >= s || minuteOfDay < e;
}

/** Disabled: both null/undefined. Enabled: both integers in range, start !== end. */
export function validateQuietHoursPair(
  start: number | null | undefined,
  end: number | null | undefined,
): string | null {
  const sNull = start === undefined || start === null;
  const eNull = end === undefined || end === null;
  if (sNull && eNull) return null;
  if (sNull !== eNull) return "validation_error: quiet hours both or none";
  const s = start as number;
  const e = end as number;
  if (!Number.isInteger(s) || s < 0 || s > 1439) return "validation_error: quiet start";
  if (!Number.isInteger(e) || e < 1 || e > 1440) return "validation_error: quiet end";
  if (s === e) return "validation_error: quiet range empty";
  return null;
}
