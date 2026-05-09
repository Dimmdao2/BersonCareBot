/** slots_v1 JSON stored in reminder_rules.schedule_data (public schema). */
export type ReminderDayFilter = "weekdays" | "weekly_mask" | "every_n_days";

export type SlotsV1ScheduleData = {
  timesLocal: string[];
  dayFilter: ReminderDayFilter;
  /** Required when dayFilter === 'weekly_mask' */
  daysMask?: string;
  /** Required when dayFilter === 'every_n_days' */
  everyNDays?: number;
  anchorDate?: string;
};

export const DEFAULT_REHAB_WEEKDAY_SLOTS: SlotsV1ScheduleData = {
  timesLocal: ["12:00", "15:00", "17:00"],
  dayFilter: "weekdays",
};

/** Sentinel stored in DB / POST when schedule_type is slots_v1 (dispatch uses schedule_data). */
export const SLOTS_V1_DB_PLACEHOLDER = {
  intervalMinutes: 60,
  windowStartMinute: 0,
  windowEndMinute: 1440,
} as const;

function parseHhMmToParts(s: string): { h: number; min: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) return null;
  return { h, min };
}

/** Dedupe by minute-of-day, sort ascending; returns validation error message or null. */
export function normalizeSlotsV1ScheduleData(
  data: SlotsV1ScheduleData,
): { ok: true; data: SlotsV1ScheduleData } | { ok: false; error: string } {
  const minuteSet = new Map<number, string>();
  for (const raw of data.timesLocal) {
    if (typeof raw !== "string") return { ok: false, error: "validation_error: timesLocal" };
    const parts = parseHhMmToParts(raw);
    if (!parts) return { ok: false, error: "validation_error: timesLocal format" };
    const mod = parts.h * 60 + parts.min;
    const canonical = `${String(parts.h).padStart(2, "0")}:${String(parts.min).padStart(2, "0")}`;
    minuteSet.set(mod, canonical);
  }
  if (minuteSet.size === 0) return { ok: false, error: "validation_error: at least one time" };

  const sortedTimes = [...minuteSet.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, hhmm]) => hhmm);

  if (data.dayFilter === "weekly_mask") {
    const dm = data.daysMask ?? "";
    if (!/^[01]{7}$/.test(dm)) return { ok: false, error: "validation_error: daysMask weekly_mask" };
  }
  if (data.dayFilter === "every_n_days") {
    const n = data.everyNDays ?? 0;
    const anchor = (data.anchorDate ?? "").trim();
    if (n < 1 || !anchor) return { ok: false, error: "validation_error: every_n_days" };
  }

  const next: SlotsV1ScheduleData = {
    ...data,
    timesLocal: sortedTimes,
    ...(data.dayFilter === "weekly_mask" && data.daysMask
      ? { daysMask: data.daysMask.padEnd(7, "0").slice(0, 7) }
      : {}),
  };
  return { ok: true, data: next };
}
