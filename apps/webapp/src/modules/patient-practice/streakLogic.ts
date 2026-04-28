import { DateTime } from "luxon";

/**
 * Серия дней подряд с ≥1 практикой (локальные календарные даты в tz).
 * Если сегодня ещё нет записи, цепочка может начинаться со «вчера» (README Phase 5).
 */
export function computePracticeStreak(distinctLocalDates: Set<string>, tz: string): number {
  const today = DateTime.now().setZone(tz).toISODate()!;
  const yesterday = DateTime.now().setZone(tz).minus({ days: 1 }).toISODate()!;
  const anchor = distinctLocalDates.has(today) ? today : distinctLocalDates.has(yesterday) ? yesterday : null;
  if (!anchor) return 0;
  let streak = 0;
  let cursor = anchor;
  while (distinctLocalDates.has(cursor)) {
    streak += 1;
    cursor = DateTime.fromISO(cursor, { zone: tz }).minus({ days: 1 }).toISODate()!;
  }
  return streak;
}
