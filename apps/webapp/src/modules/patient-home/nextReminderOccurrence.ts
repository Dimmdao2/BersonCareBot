import { DateTime } from "luxon";
import type { ReminderLinkedObjectType, ReminderRule } from "@/modules/reminders/types";

const LINKED_TYPES: ReminderLinkedObjectType[] = ["lfk_complex", "content_section", "content_page"];

/**
 * Next fire instant for a single rule in its `timezone` (or app fallback), using the same
 * day mask + window + interval model as the integrator reminder policy.
 */
export function computeNextOccurrenceUtcForRule(
  rule: ReminderRule,
  now: Date,
  appFallbackTimezone: string,
): Date | null {
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
        return slot.toJSDate();
      }
    }
  }
  return null;
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
