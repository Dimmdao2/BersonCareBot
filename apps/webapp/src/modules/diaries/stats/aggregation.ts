/**
 * Pure aggregation for symptom and LFK diary stats (no React, no HTTP).
 */
import type { LfkSession } from "../types";

/** Состояние отметки ЛФК по дню (для компактных индикаторов / матриц). */
export type LfkDotState = "done" | "none" | "partial";

export type SymptomDayPoint = {
  /** UTC calendar date YYYY-MM-DD */
  date: string;
  value: number;
  entryType?: "instant" | "daily";
};

/**
 * For each UTC calendar day, keep the **maximum** `value0_10` among entries on that day.
 * If two entries tie, the later `recordedAt` wins for `entryType` metadata.
 */
export function aggregateSymptomEntriesByDay(
  entries: Array<{
    recordedAt: string;
    value0_10: number;
    entryType: "instant" | "daily";
  }>
): SymptomDayPoint[] {
  const best = new Map<
    string,
    { value: number; entryType: "instant" | "daily"; recordedAt: string }
  >();
  for (const e of entries) {
    const day = e.recordedAt.slice(0, 10);
    const cur = best.get(day);
    if (!cur) {
      best.set(day, { value: e.value0_10, entryType: e.entryType, recordedAt: e.recordedAt });
      continue;
    }
    if (e.value0_10 > cur.value) {
      best.set(day, { value: e.value0_10, entryType: e.entryType, recordedAt: e.recordedAt });
    } else if (e.value0_10 === cur.value && e.recordedAt > cur.recordedAt) {
      best.set(day, { value: e.value0_10, entryType: e.entryType, recordedAt: e.recordedAt });
    }
  }
  return [...best.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, v]) => ({ date, value: v.value, entryType: v.entryType }));
}

/** Last 7 UTC calendar days, oldest → newest; maps session counts to LfkDotState. */
export function lfkDotsLast7DaysFromSessions(
  sessions: { completedAt: string }[],
  now: Date = new Date()
): LfkDotState[] {
  const keys: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    keys.push(d.toISOString().slice(0, 10));
  }
  const byDay = new Map<string, number>();
  for (const s of sessions) {
    const day = s.completedAt.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }
  return keys.map((day) => {
    const n = byDay.get(day) ?? 0;
    if (n === 0) return "none";
    if (n >= 2) return "partial";
    return "done";
  });
}

/**
 * One row per day in `dayKeys`, one column per complex id: true if at least one session
 * completed that UTC day for that complex.
 */
export function buildLfkOverviewMatrix(
  dayKeys: string[],
  complexIds: string[],
  sessions: Pick<LfkSession, "complexId" | "completedAt">[]
): boolean[][] {
  const set = new Set<string>();
  for (const s of sessions) {
    const day = s.completedAt.slice(0, 10);
    set.add(`${s.complexId}:${day}`);
  }
  return dayKeys.map((day) => complexIds.map((cid) => set.has(`${cid}:${day}`)));
}

export type LfkDayPoint = { date: string; value: number };

/**
 * По каждому UTC-календарному дню — максимум из доступных `pain0_10` и `difficulty0_10` (0–10).
 * Дни без ни одного заданного значения пропускаются.
 */
export function aggregateLfkSessionsMetricByDay(
  sessions: Pick<LfkSession, "completedAt" | "pain0_10" | "difficulty0_10">[]
): LfkDayPoint[] {
  const best = new Map<string, number>();
  for (const s of sessions) {
    const day = s.completedAt.slice(0, 10);
    const pain = s.pain0_10;
    const diff = s.difficulty0_10;
    const candidates: number[] = [];
    if (pain != null && Number.isFinite(pain)) candidates.push(Math.min(10, Math.max(0, pain)));
    if (diff != null && Number.isFinite(diff)) candidates.push(Math.min(10, Math.max(0, diff)));
    if (candidates.length === 0) continue;
    const v = Math.max(...candidates);
    const cur = best.get(day);
    if (cur === undefined || v > cur) best.set(day, v);
  }
  return [...best.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, value]) => ({ date, value }));
}
