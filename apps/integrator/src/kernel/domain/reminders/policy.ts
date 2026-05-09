import { DEFAULT_APP_DISPLAY_TIMEZONE } from '../../../config/appTimezone.js';
import {
  REMINDER_SCHEDULE_PRESETS,
  type ReminderOccurrenceRecord,
  type ReminderRuleRecord,
  type ReminderSchedulePreset,
} from '../../contracts/reminders.js';

export type ReminderOccurrenceDraft = Pick<
  ReminderOccurrenceRecord,
  'occurrenceKey' | 'plannedAt'
>;

type ZonedDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekdayShort: string;
};

const zonedFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getZonedFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = zonedFormatterCache.get(timeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  });
  zonedFormatterCache.set(timeZone, formatter);
  return formatter;
}

function getZonedParts(date: Date, timeZone: string): ZonedDateParts {
  const parts = getZonedFormatter(timeZone).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const value = parts.find((part) => part.type === type)?.value ?? '0';
    return Number(value);
  };
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
    weekdayShort: parts.find((part) => part.type === 'weekday')?.value ?? 'Mon',
  };
}

function weekdayMaskIndex(weekdayShort: string): number {
  const normalized = weekdayShort.toLowerCase();
  switch (normalized) {
    case 'mon':
      return 0;
    case 'tue':
      return 1;
    case 'wed':
      return 2;
    case 'thu':
      return 3;
    case 'fri':
      return 4;
    case 'sat':
      return 5;
    case 'sun':
      return 6;
    default:
      return 0;
  }
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = getZonedParts(date, timeZone);
  const reconstructedUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return reconstructedUtc - date.getTime();
}

function zonedLocalDateTimeToUtc(input: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second?: number;
  timeZone: string;
}): Date {
  const guess = new Date(Date.UTC(
    input.year,
    input.month - 1,
    input.day,
    input.hour,
    input.minute,
    input.second ?? 0,
  ));
  const offsetMs = getTimeZoneOffsetMs(guess, input.timeZone);
  return new Date(guess.getTime() - offsetMs);
}

function localDateKey(parts: Pick<ZonedDateParts, 'year' | 'month' | 'day'>): string {
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

export function reminderPresetConfig(preset: ReminderSchedulePreset): {
  intervalMinutes: number;
  windowStartMinute: number;
  windowEndMinute: number;
} {
  switch (preset) {
    case 'twice_daily':
      return {
        intervalMinutes: 540,
        windowStartMinute: 9 * 60,
        windowEndMinute: 18 * 60,
      };
    case 'every_3_hours':
      return {
        intervalMinutes: 180,
        windowStartMinute: 9 * 60,
        windowEndMinute: 21 * 60,
      };
    case 'daily':
    default:
      return {
        intervalMinutes: 24 * 60,
        windowStartMinute: 9 * 60,
        windowEndMinute: 9 * 60,
      };
  }
}

export function detectReminderPreset(rule: Pick<
  ReminderRuleRecord,
  'intervalMinutes' | 'windowStartMinute' | 'windowEndMinute'
>): ReminderSchedulePreset {
  for (const preset of REMINDER_SCHEDULE_PRESETS) {
    const config = reminderPresetConfig(preset);
    if (
      config.intervalMinutes === rule.intervalMinutes
      && config.windowStartMinute === rule.windowStartMinute
      && config.windowEndMinute === rule.windowEndMinute
    ) {
      return preset;
    }
  }
  return 'daily';
}

export function cycleReminderPreset(
  current: ReminderSchedulePreset | null | undefined,
): ReminderSchedulePreset {
  const currentIndex = REMINDER_SCHEDULE_PRESETS.indexOf(current ?? 'daily');
  const nextIndex = currentIndex >= 0
    ? (currentIndex + 1) % REMINDER_SCHEDULE_PRESETS.length
    : 0;
  return REMINDER_SCHEDULE_PRESETS[nextIndex] ?? 'daily';
}

export function reminderPresetLabel(preset: ReminderSchedulePreset): string {
  switch (preset) {
    case 'twice_daily':
      return '2 раза в день';
    case 'every_3_hours':
      return 'Каждые 3 часа';
    case 'daily':
    default:
      return '1 раз в день';
  }
}

export function buildDefaultReminderRule(input: {
  id: string;
  userId: string;
  category: ReminderRuleRecord['category'];
  timezone?: string;
}): ReminderRuleRecord {
  const config = reminderPresetConfig('daily');
  return {
    id: input.id,
    userId: input.userId,
    category: input.category,
    isEnabled: false,
    scheduleType: 'interval_window',
    timezone: input.timezone ?? DEFAULT_APP_DISPLAY_TIMEZONE,
    intervalMinutes: config.intervalMinutes,
    windowStartMinute: config.windowStartMinute,
    windowEndMinute: config.windowEndMinute,
    daysMask: '1111111',
    contentMode: 'none',
  };
}

type SlotsV1Data = {
  timesLocal: string[];
  dayFilter: 'weekdays' | 'weekly_mask' | 'every_n_days';
  daysMask?: string;
  everyNDays?: number;
  anchorDate?: string;
};

function parseSlotsV1Data(raw: unknown): SlotsV1Data | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.timesLocal) || typeof o.dayFilter !== 'string') return null;
  return raw as SlotsV1Data;
}

/** Same-day [start,end) or overnight wrap; disabled when either bound is null. */
function isMinuteOfDayInQuietHours(
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

function parseHhMmToMinuteOfDay(s: string): number | null {
  const t = s.trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
  return h * 60 + min;
}

function isDayActiveForSlots(
  data: SlotsV1Data,
  rule: ReminderRuleRecord,
  weekdayIndex: number,
  zonedNow: ReturnType<typeof getZonedParts>,
): boolean {
  if (data.dayFilter === 'weekdays') {
    return weekdayIndex >= 0 && weekdayIndex <= 4;
  }
  if (data.dayFilter === 'weekly_mask') {
    const mask = (data.daysMask ?? rule.daysMask ?? '1111111').padStart(7, '0').slice(0, 7);
    return mask[weekdayIndex] === '1';
  }
  if (data.dayFilter === 'every_n_days') {
    const n = data.everyNDays ?? 1;
    const anchor = (data.anchorDate ?? '').trim();
    if (!anchor || n < 1) return false;
    const todayKey = localDateKey(zonedNow);
    let diff: number;
    try {
      const b = new Date(`${todayKey}T12:00:00`);
      const a = new Date(`${anchor}T12:00:00`);
      diff = Math.round((b.getTime() - a.getTime()) / 86400000);
    } catch {
      return false;
    }
    if (diff < 0) return false;
    return diff % n === 0;
  }
  return false;
}

function planSlotsV1DueOccurrences(rule: ReminderRuleRecord, nowIso: string): ReminderOccurrenceDraft[] {
  const data = parseSlotsV1Data(rule.scheduleData);
  if (!data) return [];
  const now = new Date(nowIso);
  const zonedNow = getZonedParts(now, rule.timezone);
  const weekdayIndex = weekdayMaskIndex(zonedNow.weekdayShort);
  if (!isDayActiveForSlots(data, rule, weekdayIndex, zonedNow)) return [];

  const results: ReminderOccurrenceDraft[] = [];
  for (const tl of data.timesLocal) {
    const minuteOfDay = parseHhMmToMinuteOfDay(typeof tl === 'string' ? tl : '');
    if (minuteOfDay === null) continue;
    if (isMinuteOfDayInQuietHours(minuteOfDay, rule.quietHoursStartMinute, rule.quietHoursEndMinute)) {
      continue;
    }
    const slotUtc = zonedLocalDateTimeToUtc({
      year: zonedNow.year,
      month: zonedNow.month,
      day: zonedNow.day,
      hour: Math.floor(minuteOfDay / 60),
      minute: minuteOfDay % 60,
      timeZone: rule.timezone,
    });
    if (slotUtc.getTime() > now.getTime()) continue;
    results.push({
      occurrenceKey: `${rule.id}:${localDateKey(zonedNow)}:slot:${minuteOfDay}`,
      plannedAt: slotUtc.toISOString(),
    });
  }
  return results;
}

export function planDueReminderOccurrences(
  rule: ReminderRuleRecord,
  nowIso: string,
): ReminderOccurrenceDraft[] {
  if (!rule.isEnabled) return [];
  if (rule.scheduleType === 'slots_v1') {
    return planSlotsV1DueOccurrences(rule, nowIso);
  }
  const now = new Date(nowIso);
  const zonedNow = getZonedParts(now, rule.timezone);
  const weekdayIndex = weekdayMaskIndex(zonedNow.weekdayShort);
  if (rule.daysMask[weekdayIndex] !== '1') return [];

  const results: ReminderOccurrenceDraft[] = [];
  for (
    let minute = rule.windowStartMinute;
    minute <= rule.windowEndMinute;
    minute += Math.max(1, rule.intervalMinutes)
  ) {
    if (isMinuteOfDayInQuietHours(minute, rule.quietHoursStartMinute, rule.quietHoursEndMinute)) {
      continue;
    }
    const slotUtc = zonedLocalDateTimeToUtc({
      year: zonedNow.year,
      month: zonedNow.month,
      day: zonedNow.day,
      hour: Math.floor(minute / 60),
      minute: minute % 60,
      timeZone: rule.timezone,
    });
    if (slotUtc.getTime() > now.getTime()) continue;
    results.push({
      occurrenceKey: `${rule.id}:${localDateKey(zonedNow)}:${minute}`,
      plannedAt: slotUtc.toISOString(),
    });
  }
  return results;
}
