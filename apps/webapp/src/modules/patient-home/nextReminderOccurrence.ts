import { DateTime } from "luxon";
import type { ReminderLinkedObjectType, ReminderRule } from "@/modules/reminders/types";
import type { SlotsV1ScheduleData } from "@/modules/reminders/scheduleSlots";

/** Rules that participate in home «next reminder» + daily planned counts. */
const LINKED_TYPES: ReminderLinkedObjectType[] = [
  "lfk_complex",
  "content_section",
  "content_page",
  "rehab_program",
];

function parseHhMmToMinuteOfDay(s: string): number | null {
  const t = s.trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
  return h * 60 + min;
}

function localDateKeyLuxon(dt: DateTime): string {
  return dt.toFormat("yyyy-LL-dd");
}

function isDayActiveSlotsV1(data: SlotsV1ScheduleData, rule: ReminderRule, day: DateTime, tz: string): boolean {
  const weekdayIndex0 = day.weekday - 1;
  if (data.dayFilter === "weekdays") {
    return weekdayIndex0 >= 0 && weekdayIndex0 <= 4;
  }
  if (data.dayFilter === "weekly_mask") {
    const mask = (data.daysMask ?? rule.daysMask ?? "1111111").padStart(7, "0").slice(0, 7);
    return mask[weekdayIndex0] === "1";
  }
  if (data.dayFilter === "every_n_days") {
    const n = data.everyNDays ?? 1;
    const anchor = (data.anchorDate ?? "").trim();
    if (!anchor || n < 1) return false;
    const todayKey = localDateKeyLuxon(day);
    let diff = 0;
    try {
      const b = DateTime.fromISO(`${todayKey}T12:00:00`, { zone: tz });
      const a = DateTime.fromISO(`${anchor}T12:00:00`, { zone: tz });
      diff = Math.round(b.diff(a, "days").days);
    } catch {
      return false;
    }
    if (diff < 0) return false;
    return diff % n === 0;
  }
  return false;
}

function localDaysTouchingUtcRange(rangeStart: Date, rangeEnd: Date, tz: string): DateTime[] {
  const out: DateTime[] = [];
  let d = DateTime.fromJSDate(rangeStart, { zone: "utc" }).setZone(tz).startOf("day");
  const endFloor =
    rangeEnd.getTime() <= rangeStart.getTime() ?
      d
    : DateTime.fromJSDate(new Date(rangeEnd.getTime() - 1), { zone: "utc" }).setZone(tz).startOf("day");
  while (d <= endFloor) {
    out.push(d);
    d = d.plus({ days: 1 });
  }
  return out;
}

function countIntervalWindowOccurrencesInRange(rule: ReminderRule, rangeStart: Date, rangeEnd: Date): number {
  const tz = rule.timezone?.trim() || "UTC";
  const intervalMin = Math.max(1, rule.intervalMinutes ?? 60);
  const mask = rule.daysMask;
  if (!/^[01]{7}$/.test(mask)) return 0;
  const winStart = rule.windowStartMinute;
  const winEnd = rule.windowEndMinute;
  if (winStart > winEnd) return 0;
  let count = 0;
  for (const day of localDaysTouchingUtcRange(rangeStart, rangeEnd, tz)) {
    const weekdayIdx = day.weekday - 1;
    if (mask[weekdayIdx] !== "1") continue;
    for (let m = winStart; m <= winEnd; m += intervalMin) {
      const slot = day.set({
        hour: Math.floor(m / 60),
        minute: m % 60,
        second: 0,
        millisecond: 0,
      });
      const inst = slot.toUTC().toJSDate();
      if (inst >= rangeStart && inst < rangeEnd) count += 1;
    }
  }
  return count;
}

function countSlotsV1OccurrencesInRange(rule: ReminderRule, rangeStart: Date, rangeEnd: Date): number {
  const data = rule.scheduleData;
  if (!data || !Array.isArray(data.timesLocal)) return 0;
  const tz = rule.timezone?.trim() || "UTC";
  let count = 0;
  for (const day of localDaysTouchingUtcRange(rangeStart, rangeEnd, tz)) {
    if (!isDayActiveSlotsV1(data, rule, day, tz)) continue;
    for (const tl of data.timesLocal) {
      const minuteOfDay = parseHhMmToMinuteOfDay(typeof tl === "string" ? tl : "");
      if (minuteOfDay === null) continue;
      const slot = day.set({
        hour: Math.floor(minuteOfDay / 60),
        minute: minuteOfDay % 60,
        second: 0,
        millisecond: 0,
      });
      const inst = slot.toUTC().toJSDate();
      if (inst >= rangeStart && inst < rangeEnd) count += 1;
    }
  }
  return count;
}

/**
 * Planned home-linked reminder fires (interval_window or slots_v1) whose instant falls in `[rangeStart, rangeEnd)`.
 * Used for «n из N» on patient home; evaluate each rule in its own `timezone`.
 */
export function countPlannedHomeReminderOccurrencesInUtcRange(
  rules: ReminderRule[],
  rangeStart: Date,
  rangeEnd: Date,
): number {
  let n = 0;
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (!rule.linkedObjectType || !LINKED_TYPES.includes(rule.linkedObjectType)) continue;
    if (rule.scheduleType === "slots_v1" && rule.scheduleData) {
      n += countSlotsV1OccurrencesInRange(rule, rangeStart, rangeEnd);
    } else {
      n += countIntervalWindowOccurrencesInRange(rule, rangeStart, rangeEnd);
    }
  }
  return n;
}

function computeNextSlotsV1OccurrenceUtc(
  rule: ReminderRule,
  now: Date,
  appFallbackTimezone: string,
): Date | null {
  const data = rule.scheduleData;
  if (!data || !Array.isArray(data.timesLocal)) return null;
  const tz = rule.timezone?.trim() || appFallbackTimezone;
  const nowDt = DateTime.fromJSDate(now, { zone: tz });
  if (!nowDt.isValid) return null;

  for (let dayOffset = 0; dayOffset < 14; dayOffset += 1) {
    const day = nowDt.startOf("day").plus({ days: dayOffset });
    if (!isDayActiveSlotsV1(data, rule, day, tz)) continue;
    const sortedTimes = [...data.timesLocal].sort();
    for (const tl of sortedTimes) {
      const minuteOfDay = parseHhMmToMinuteOfDay(typeof tl === "string" ? tl : "");
      if (minuteOfDay === null) continue;
      const slot = day.set({
        hour: Math.floor(minuteOfDay / 60),
        minute: minuteOfDay % 60,
        second: 0,
        millisecond: 0,
      });
      if (slot > nowDt) {
        return slot.toUTC().toJSDate();
      }
    }
  }
  return null;
}

/**
 * Next fire instant for a single rule in its `timezone` (or app fallback).
 * Supports `interval_window` and `slots_v1`.
 */
export function computeNextOccurrenceUtcForRule(
  rule: ReminderRule,
  now: Date,
  appFallbackTimezone: string,
): Date | null {
  if (rule.scheduleType === "slots_v1" && rule.scheduleData) {
    return computeNextSlotsV1OccurrenceUtc(rule, now, appFallbackTimezone);
  }

  const tz = rule.timezone?.trim() || appFallbackTimezone;
  const intervalMin = Math.max(1, rule.intervalMinutes ?? 60);
  const mask = rule.daysMask;
  if (!/^[01]{7}$/.test(mask)) return null;

  const winStart = rule.windowStartMinute;
  const winEnd = rule.windowEndMinute;
  if (winStart > winEnd) return null;

  const nowDt = DateTime.fromJSDate(now, { zone: tz });
  if (!nowDt.isValid) return null;

  for (let dayOffset = 0; dayOffset < 14; dayOffset += 1) {
    const day = nowDt.startOf("day").plus({ days: dayOffset });
    const weekdayIdx = day.weekday - 1;
    if (mask[weekdayIdx] !== "1") continue;

    for (let m = winStart; m <= winEnd; m += intervalMin) {
      const hour = Math.floor(m / 60);
      const minute = m % 60;
      const slot = day.set({ hour, minute, second: 0, millisecond: 0 });
      if (slot > nowDt) {
        return slot.toUTC().toJSDate();
      }
    }
  }
  return null;
}

/**
 * Момент, с которого считаем «следующее по расписанию», если глобально заглушены push:
 * не раньше окончания `reminder_muted_until`, иначе показывали бы слот во время паузы.
 */
export function reminderScheduleEvaluationInstant(now: Date, mutedUntilIso: string | null | undefined): Date {
  const trimmed = mutedUntilIso?.trim();
  if (!trimmed) return now;
  const until = new Date(trimmed);
  if (!Number.isFinite(until.getTime())) return now;
  if (until.getTime() <= now.getTime()) return now;
  return until;
}

export function pickNextHomeReminder(
  rules: ReminderRule[],
  now: Date,
  appFallbackTimezone: string,
): { rule: ReminderRule; nextAt: Date } | null {
  const candidates = rules.filter(
    (r) => r.enabled && r.linkedObjectType != null && LINKED_TYPES.includes(r.linkedObjectType),
  );
  let best: { rule: ReminderRule; nextAt: Date } | null = null;
  for (const rule of candidates) {
    const nextAt = computeNextOccurrenceUtcForRule(rule, now, appFallbackTimezone);
    if (!nextAt) continue;
    if (!best || nextAt.getTime() < best.nextAt.getTime()) {
      best = { rule, nextAt };
    }
  }
  return best;
}

/** Short label in app display timezone (e.g. «Пн, 09:15»). */
export function formatNextReminderLabel(nextAt: Date, displayTimeZone: string): string {
  const dt = DateTime.fromMillis(nextAt.getTime()).setZone(displayTimeZone);
  if (!dt.isValid) return "";
  return dt.setLocale("ru").toFormat("ccc, HH:mm");
}

function ruMinuteWord(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "минут";
  const mod10 = n % 10;
  if (mod10 === 1) return "минуту";
  if (mod10 >= 2 && mod10 <= 4) return "минуты";
  return "минут";
}

function ruHourWordHeadline(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "часов";
  const mod10 = n % 10;
  if (mod10 === 1) return "час";
  if (mod10 >= 2 && mod10 <= 4) return "часа";
  return "часов";
}

function ruDayWordMute(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "дней";
  const mod10 = n % 10;
  if (mod10 === 1) return "день";
  if (mod10 >= 2 && mod10 <= 4) return "дня";
  return "дней";
}

/**
 * Главная строка карточки «Следующее напоминание»: относительное время сегодня,
 * «Завтра в …», либо «В …» с днём недели.
 */
export function formatPatientHomeNextReminderHeadline(nextAt: Date, now: Date, displayTimeZone: string): string {
  const dtNext = DateTime.fromMillis(nextAt.getTime()).setZone(displayTimeZone);
  const dtNow = DateTime.fromMillis(now.getTime()).setZone(displayTimeZone);
  if (!dtNext.isValid || !dtNow.isValid) return formatNextReminderLabel(nextAt, displayTimeZone);

  const diffMinutes = Math.max(0, Math.ceil(dtNext.diff(dtNow, "minutes").minutes));

  const tomorrowStart = dtNow.plus({ days: 1 }).startOf("day");
  const isTomorrow = dtNext >= tomorrowStart && dtNext < tomorrowStart.plus({ days: 1 });

  if (dtNext.hasSame(dtNow, "day")) {
    if (diffMinutes < 1) return "Скоро";
    if (diffMinutes < 60) {
      return `Через ${diffMinutes} ${ruMinuteWord(diffMinutes)}`;
    }
    const hours = Math.ceil(diffMinutes / 60);
    return `Через ${hours} ${ruHourWordHeadline(hours)}`;
  }

  if (isTomorrow) {
    return `Завтра в ${dtNext.toFormat("HH:mm")}`;
  }

  /** «В понедельник» / «Во вторник» / «В среду» … (предложный падеж после «в/во»). */
  const accusativeWeekday: Record<number, string> = {
    1: "понедельник",
    2: "вторник",
    3: "среду",
    4: "четверг",
    5: "пятницу",
    6: "субботу",
    7: "воскресенье",
  };
  const w = dtNext.weekday;
  const dayRu = accusativeWeekday[w] ?? dtNext.setLocale("ru").toFormat("cccc");
  const prep = w === 2 ? "Во" : "В";
  return `${prep} ${dayRu} в ${dtNext.toFormat("HH:mm")}`;
}

/**
 * Хвост для «Напоминания заглушены на …» (только число + слово).
 */
export function formatReminderMuteRemainingRu(mutedUntilIso: string, now: Date): string {
  const endMs = Date.parse(mutedUntilIso.trim());
  if (!Number.isFinite(endMs)) return "";
  const minsTotal = Math.max(0, Math.ceil((endMs - now.getTime()) / 60_000));
  if (minsTotal < 1) return "меньше минуты";
  if (minsTotal < 60) {
    return `${minsTotal} ${ruMinuteWord(minsTotal)}`;
  }
  const hoursTotal = Math.ceil(minsTotal / 60);
  if (hoursTotal < 24) {
    return `${hoursTotal} ${ruHourWordHeadline(hoursTotal)}`;
  }
  const daysTotal = Math.ceil(minsTotal / (60 * 24));
  return `${daysTotal} ${ruDayWordMute(daysTotal)}`;
}

/** Есть ли хотя бы одно включённое домашнее напоминание (тип из LINKED_TYPES). */
export function hasConfiguredHomeLinkedReminders(rules: ReminderRule[]): boolean {
  return rules.some(
    (r) => r.enabled && r.linkedObjectType != null && LINKED_TYPES.includes(r.linkedObjectType),
  );
}
