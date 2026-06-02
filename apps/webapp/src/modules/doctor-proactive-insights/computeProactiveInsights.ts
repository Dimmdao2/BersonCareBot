import { DateTime } from "luxon";
import { isWellbeingGeneralMirrorNote } from "@/modules/diaries/wellbeingGeneralMirrorNote";
import {
  PROACTIVE_PROGRAM_INACTIVITY_DAYS,
  PROACTIVE_WELLBEING_LOW_MAX_VALUE,
  PROACTIVE_WELLBEING_LOW_STREAK_DAYS,
} from "./constants";
import type { ProactiveInsightKind, ProactiveInsightRow } from "./types";

export type ProactivePatientRef = {
  patientUserId: string;
  displayName: string;
};

export type ProactiveWellbeingEntry = {
  patientUserId: string;
  recordedAt: string;
  value: number;
  notes: string | null;
};

export type ProactiveProgramActivity = {
  patientUserId: string;
  activeInstanceId: string | null;
  lastDoneAt: string | null;
  hasActiveDoctorProgram: boolean;
};

/** Якорь streak: сегодня, если есть запись; иначе вчера, если есть запись. */
function resolveStreakEndDay(now: DateTime, daily: Map<string, number>): string | null {
  const today = now.toISODate();
  if (today && daily.has(today)) return today;
  const yesterday = now.minus({ days: 1 }).toISODate();
  if (yesterday && daily.has(yesterday)) return yesterday;
  return null;
}

function localDayKey(recordedAt: string, iana: string): string | null {
  const dt = DateTime.fromISO(recordedAt, { zone: "utc" }).setZone(iana);
  return dt.isValid ? dt.toISODate() : null;
}

/** Дневной «худший» показатель (min value = worse mood on 1–5 scale). */
function dailyWorstValueByDay(
  entries: ProactiveWellbeingEntry[],
  iana: string,
): Map<string, number> {
  const byDay = new Map<string, number>();
  for (const e of entries) {
    if (isWellbeingGeneralMirrorNote(e.notes)) continue;
    const day = localDayKey(e.recordedAt, iana);
    if (!day) continue;
    const prev = byDay.get(day);
    if (prev === undefined || e.value < prev) byDay.set(day, e.value);
  }
  return byDay;
}

export function detectWellbeingLowStreakInsights(params: {
  patients: readonly ProactivePatientRef[];
  entries: readonly ProactiveWellbeingEntry[];
  iana: string;
  streakDays?: number;
  maxLowValue?: number;
  now?: DateTime;
}): ProactiveInsightRow[] {
  const streakDays = params.streakDays ?? PROACTIVE_WELLBEING_LOW_STREAK_DAYS;
  const maxLowValue = params.maxLowValue ?? PROACTIVE_WELLBEING_LOW_MAX_VALUE;
  const now = (params.now ?? DateTime.now()).setZone(params.iana);
  const out: ProactiveInsightRow[] = [];

  const entriesByPatient = new Map<string, ProactiveWellbeingEntry[]>();
  for (const e of params.entries) {
    const list = entriesByPatient.get(e.patientUserId) ?? [];
    list.push(e);
    entriesByPatient.set(e.patientUserId, list);
  }

  for (const p of params.patients) {
    const daily = dailyWorstValueByDay(entriesByPatient.get(p.patientUserId) ?? [], params.iana);
    const endDay = resolveStreakEndDay(now, daily);
    if (!endDay) continue;
    const end = DateTime.fromISO(endDay, { zone: params.iana });
    const streakDayKeys: string[] = [];
    let allLow = true;
    for (let i = 0; i < streakDays; i++) {
      const dayKey = end.minus({ days: i }).toISODate();
      if (!dayKey) {
        allLow = false;
        break;
      }
      const worst = daily.get(dayKey);
      if (worst === undefined || worst > maxLowValue) {
        allLow = false;
        break;
      }
      streakDayKeys.push(dayKey);
    }
    if (!allLow || streakDayKeys.length < streakDays) continue;

    const sortAt = end.endOf("day").toUTC().toISO() ?? now.toUTC().toISO()!;
    out.push({
      kind: "wellbeing_low_streak",
      patientUserId: p.patientUserId,
      patientDisplayName: p.displayName.trim() || "—",
      summary: `Низкое самочувствие ${streakDays} дн. подряд`,
      sortAt,
    });
  }

  return out;
}

export function detectProgramInactivityInsights(params: {
  patients: readonly ProactivePatientRef[];
  activity: readonly ProactiveProgramActivity[];
  inactiveDays?: number;
  now?: DateTime;
}): ProactiveInsightRow[] {
  const inactiveDays = params.inactiveDays ?? PROACTIVE_PROGRAM_INACTIVITY_DAYS;
  const now = params.now ?? DateTime.now();
  const cutoff = now.minus({ days: inactiveDays });
  const activityByPatient = new Map(params.activity.map((a) => [a.patientUserId, a]));
  const out: ProactiveInsightRow[] = [];

  for (const p of params.patients) {
    const act = activityByPatient.get(p.patientUserId);
    if (!act?.hasActiveDoctorProgram) continue;
    const lastDone = act.lastDoneAt ? DateTime.fromISO(act.lastDoneAt) : null;
    const inactive =
      !lastDone?.isValid || lastDone < cutoff;
    if (!inactive) continue;

    const sortAt =
      lastDone?.isValid ? lastDone.toUTC().toISO()! : cutoff.toUTC().toISO()!;
    out.push({
      kind: "program_inactivity",
      patientUserId: p.patientUserId,
      patientDisplayName: p.displayName.trim() || "—",
      summary: `Нет отметок по программе ${inactiveDays}+ дн.`,
      sortAt,
      ...(act.activeInstanceId ? { activeProgramInstanceId: act.activeInstanceId } : {}),
    });
  }

  return out;
}

export function mergeProactiveInsights(
  groups: readonly (readonly ProactiveInsightRow[])[],
  limit: number,
): ProactiveInsightRow[] {
  const merged = groups.flat();
  merged.sort((a, b) => b.sortAt.localeCompare(a.sortAt));
  const seen = new Set<string>();
  const out: ProactiveInsightRow[] = [];
  for (const row of merged) {
    const key = `${row.kind}:${row.patientUserId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
    if (out.length >= limit) break;
  }
  return out;
}

export function proactiveInsightKindLabelRu(kind: ProactiveInsightKind): string {
  if (kind === "wellbeing_low_streak") return "Самочувствие";
  return "Программа";
}
