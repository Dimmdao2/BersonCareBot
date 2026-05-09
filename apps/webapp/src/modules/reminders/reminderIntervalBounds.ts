/** Minimum interval (minutes) for `interval_window` schedules (patient + legacy editor). */
export const REMINDER_INTERVAL_WINDOW_MIN_MINUTES = 30;
/** Maximum interval: 10h 59m. */
export const REMINDER_INTERVAL_WINDOW_MAX_MINUTES = 659;

export function clampIntervalMinutes(raw: number): number {
  const n = Math.round(raw);
  if (!Number.isFinite(n)) return REMINDER_INTERVAL_WINDOW_MIN_MINUTES;
  return Math.max(
    REMINDER_INTERVAL_WINDOW_MIN_MINUTES,
    Math.min(REMINDER_INTERVAL_WINDOW_MAX_MINUTES, n),
  );
}

/** Split total minutes (30…659) into hour and minute-of-hour for UI wheels. */
export function intervalToHourMinute(total: number): { hour: number; minute: number } {
  const t = clampIntervalMinutes(total);
  return { hour: Math.floor(t / 60), minute: t % 60 };
}

/** Returns total minutes or null if combination is outside product rules. */
export function hourMinuteToInterval(hour: number, minute: number): number | null {
  const h = Math.trunc(hour);
  const m = Math.trunc(minute);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || h !== hour || m !== minute) return null;
  if (h < 0 || h > 10 || m < 0 || m > 59) return null;
  if (h === 0 && m < 30) return null;
  const t = h * 60 + m;
  if (t < REMINDER_INTERVAL_WINDOW_MIN_MINUTES || t > REMINDER_INTERVAL_WINDOW_MAX_MINUTES) return null;
  return t;
}
