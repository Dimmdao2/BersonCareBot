import { DateTime } from "luxon";
import type { ReferencesPort } from "@/modules/references/ports";
import { isWellbeingGeneralMirrorNote } from "@/modules/diaries/wellbeingGeneralMirrorNote";
import type { SymptomEntry } from "@/modules/diaries/types";
import type { createSymptomDiaryService } from "@/modules/diaries/symptom-service";
import { getMoodDateForTimeZone } from "./moodDate";
import {
  GENERAL_WELLBEING_SYMPTOM_KEY,
  GENERAL_WELLBEING_TITLE,
  WELLBEING_REPLACE_LAST_MAX_MS,
} from "./wellbeingConstants";
import type {
  PatientMoodCheckinState,
  PatientMoodIntent,
  PatientMoodLastEntry,
  PatientMoodScore,
  PatientMoodSubmitResult,
  PatientMoodToday,
  PatientMoodWeekDay,
  PatientMoodWeekSparkline,
} from "./types";
import { isPatientMoodScore } from "./types";

type SymptomDiary = ReturnType<typeof createSymptomDiaryService>;

const WARMUP_FEELING_SYMPTOM_TYPE_CODE = "warmup_feeling";

export type PatientWellbeingMoodDeps = {
  diaries: SymptomDiary;
  references: ReferencesPort;
};

function localDayRangeUtcIso(tz: string, localYmd: string): { from: string; toExclusive: string } {
  const start = DateTime.fromISO(localYmd, { zone: tz }).startOf("day");
  const end = start.plus({ days: 1 });
  const from = start.toUTC().toISO();
  const toExclusive = end.toUTC().toISO();
  if (!from || !toExclusive) throw new Error("wellbeing_local_day_range");
  return { from, toExclusive };
}

function toMoodScore(value: number): PatientMoodScore | null {
  return isPatientMoodScore(value) ? value : null;
}

function averageMoodScores(vals: PatientMoodScore[]): PatientMoodScore {
  const sum = vals.reduce((a, b) => a + b, 0);
  return Math.min(5, Math.max(1, Math.round(sum / vals.length))) as PatientMoodScore;
}

export function createPatientMoodService(deps: PatientWellbeingMoodDeps) {
  let cachedRefId: string | null = null;

  async function wellbeingTypeRefId(): Promise<string> {
    if (cachedRefId) return cachedRefId;
    const items = await deps.references.listActiveItemsByCategoryCode("symptom_type");
    const item = items.find((i) => i.code === GENERAL_WELLBEING_SYMPTOM_KEY);
    if (!item) throw new Error("general_wellbeing_reference_missing");
    cachedRefId = item.id;
    return item.id;
  }

  async function ensureWellbeingTracking(userId: string): Promise<string> {
    const refId = await wellbeingTypeRefId();
    const t = await deps.diaries.ensureGeneralWellbeingTracking({
      userId,
      symptomTitle: GENERAL_WELLBEING_TITLE,
      symptomTypeRefId: refId,
    });
    return t.id;
  }

  async function tryWarmupFeelingTrackingId(userId: string): Promise<string | null> {
    const items = await deps.references.listActiveItemsByCategoryCode("symptom_type");
    const item = items.find((i) => i.code === WARMUP_FEELING_SYMPTOM_TYPE_CODE);
    if (!item) return null;
    const t = await deps.diaries.ensureWarmupFeelingTracking({
      userId,
      symptomTitle: item.title?.trim() || "Самочувствие после разминки",
      symptomTypeRefId: item.id,
    });
    return t.id;
  }

  async function getLatestWellbeingEntry(userId: string, trackingId: string): Promise<PatientMoodLastEntry | null> {
    const list = await deps.diaries.listSymptomEntriesForUserInRange({
      userId,
      fromRecordedAt: new Date(0).toISOString(),
      toRecordedAtExclusive: new Date("2099-01-01").toISOString(),
      trackingId,
      limit: 1,
    });
    const e = list[0];
    if (!e) return null;
    return {
      id: e.id,
      recordedAt: e.recordedAt,
      score: toMoodScore(e.value0_10),
      notes: e.notes ?? null,
    };
  }

  async function getLatestEntryOnLocalDay(
    userId: string,
    trackingId: string,
    tz: string,
    localYmd: string,
  ) {
    const { from, toExclusive } = localDayRangeUtcIso(tz, localYmd);
    const entries = await deps.diaries.listSymptomEntriesForTrackingInRange({
      userId,
      trackingId,
      fromRecordedAt: from,
      toRecordedAtExclusive: toExclusive,
    });
    if (entries.length === 0) return null;
    return entries.reduce((a, b) => (a.recordedAt >= b.recordedAt ? a : b));
  }

  async function getCheckinState(userId: string, tz: string): Promise<PatientMoodCheckinState> {
    const trackingId = await ensureWellbeingTracking(userId);
    const lastEntry = await getLatestWellbeingEntry(userId, trackingId);
    const moodDate = getMoodDateForTimeZone(tz);
    const todayEntry = await getLatestEntryOnLocalDay(userId, trackingId, tz, moodDate);
    const mood: PatientMoodToday | null =
      todayEntry && toMoodScore(todayEntry.value0_10) != null ?
        { moodDate, score: todayEntry.value0_10 as PatientMoodScore }
      : null;
    return { mood, lastEntry };
  }

  async function findLatestWarmupFeelingInLookback(
    userId: string,
    warmupTrackingId: string,
    nowMs: number,
  ): Promise<SymptomEntry | null> {
    const fromMs = nowMs - WELLBEING_REPLACE_LAST_MAX_MS;
    const entries = await deps.diaries.listSymptomEntriesForTrackingInRange({
      userId,
      trackingId: warmupTrackingId,
      fromRecordedAt: new Date(fromMs).toISOString(),
      toRecordedAtExclusive: new Date(nowMs + 1).toISOString(),
    });
    let best: SymptomEntry | null = null;
    let bestT = -Infinity;
    for (const e of entries) {
      if (e.entryType !== "instant") continue;
      const t = new Date(e.recordedAt).getTime();
      if (t > nowMs) continue;
      if (t >= bestT) {
        bestT = t;
        best = e;
      }
    }
    return best;
  }

  async function hasNonMirrorGeneralStrictlyAfterWarmup(
    userId: string,
    generalTrackingId: string,
    warmupRecordedAtIso: string,
    nowMs: number,
  ): Promise<boolean> {
    const t0 = new Date(warmupRecordedAtIso).getTime();
    const entries = await deps.diaries.listSymptomEntriesForTrackingInRange({
      userId,
      trackingId: generalTrackingId,
      fromRecordedAt: warmupRecordedAtIso,
      toRecordedAtExclusive: new Date(nowMs + 1).toISOString(),
    });
    for (const e of entries) {
      if (e.entryType !== "instant") continue;
      if (isWellbeingGeneralMirrorNote(e.notes)) continue;
      if (new Date(e.recordedAt).getTime() > t0) return true;
    }
    return false;
  }

  async function submitScore(
    userId: string,
    tz: string,
    score: number,
    _intent: PatientMoodIntent,
    nowMs: number = Date.now(),
  ): Promise<PatientMoodSubmitResult> {
    if (!Number.isInteger(score) || !isPatientMoodScore(score)) {
      return { ok: false, error: "invalid_score" };
    }
    const trackingId = await ensureWellbeingTracking(userId);
    const last = await getLatestWellbeingEntry(userId, trackingId);
    const nowIso = new Date(nowMs).toISOString();

    if (!last) {
      await deps.diaries.addEntry({
        userId,
        trackingId,
        value0_10: score,
        entryType: "instant",
        recordedAt: nowIso,
        source: "webapp",
        notes: null,
      });
      return { ok: true, ...(await getCheckinState(userId, tz)) };
    }

    const ageMs = nowMs - new Date(last.recordedAt).getTime();

    if (ageMs <= WELLBEING_REPLACE_LAST_MAX_MS) {
      const warmupTid = await tryWarmupFeelingTrackingId(userId);
      let addNewInsteadOfReplace = false;
      if (warmupTid) {
        const recentWarmup = await findLatestWarmupFeelingInLookback(userId, warmupTid, nowMs);
        if (recentWarmup) {
          const hasUserGeneralAfter = await hasNonMirrorGeneralStrictlyAfterWarmup(
            userId,
            trackingId,
            recentWarmup.recordedAt,
            nowMs,
          );
          if (!hasUserGeneralAfter) {
            addNewInsteadOfReplace = true;
          }
        }
      }

      if (addNewInsteadOfReplace) {
        await deps.diaries.addEntry({
          userId,
          trackingId,
          value0_10: score,
          entryType: "instant",
          recordedAt: nowIso,
          source: "webapp",
          notes: null,
        });
        return { ok: true, ...(await getCheckinState(userId, tz)) };
      }

      await deps.diaries.updateSymptomEntry({
        userId,
        entryId: last.id,
        value0_10: score,
        entryType: "instant",
        recordedAt: last.recordedAt,
        notes: last.notes ?? null,
      });
      return { ok: true, ...(await getCheckinState(userId, tz)) };
    }

    await deps.diaries.addEntry({
      userId,
      trackingId,
      value0_10: score,
      entryType: "instant",
      recordedAt: nowIso,
      source: "webapp",
      notes: null,
    });
    return { ok: true, ...(await getCheckinState(userId, tz)) };
  }

  async function getWeekSparkline(userId: string, tz: string): Promise<PatientMoodWeekSparkline> {
    const trackingId = await ensureWellbeingTracking(userId);
    const today = DateTime.now().setZone(tz);
    const monday = today.minus({ days: today.weekday - 1 }).startOf("day");
    const prevMonday = monday.minus({ weeks: 1 });
    const dayKeys: string[] = [];
    for (let i = 0; i < 7; i += 1) {
      const d = monday.plus({ days: i }).toISODate();
      if (d) dayKeys.push(d);
    }
    if (dayKeys.length === 0) {
      return { days: [], previousSundayScore: null, lastScoreBeforeWeek: null };
    }

    const bridgeDayKeys: string[] = [];
    for (let i = 0; i < 7; i += 1) {
      const d = prevMonday.plus({ days: i }).toISODate();
      if (d) bridgeDayKeys.push(d);
    }
    const queryDayKeys = [...bridgeDayKeys, ...dayKeys];
    const from = localDayRangeUtcIso(tz, queryDayKeys[0]!).from;
    const toExclusive = localDayRangeUtcIso(tz, dayKeys[6]!).toExclusive;
    const entries = await deps.diaries.listSymptomEntriesForTrackingInRange({
      userId,
      trackingId,
      fromRecordedAt: from,
      toRecordedAtExclusive: toExclusive,
    });

    const dayKeySet = new Set(queryDayKeys);
    const byDay = new Map<string, PatientMoodScore[]>();
    for (const e of entries) {
      if (e.entryType !== "instant") continue;
      const localD = DateTime.fromISO(e.recordedAt, { zone: "utc" }).setZone(tz).toISODate();
      if (!localD || !dayKeySet.has(localD)) continue;
      const sc = toMoodScore(e.value0_10);
      if (sc == null) continue;
      const arr = byDay.get(localD) ?? [];
      arr.push(sc);
      byDay.set(localD, arr);
    }

    const dayScore = (ymd: string): PatientMoodScore | null => {
      const vals = byDay.get(ymd);
      if (!vals || vals.length === 0) return null;
      return averageMoodScores(vals);
    };

    const days = dayKeys.map((d) => {
      const score = dayScore(d);
      return { date: d, score, warmupHint: null, diaryNoteHint: null };
    });

    const prevSundayIso = monday.minus({ days: 1 }).toISODate();
    const previousSundayScore = prevSundayIso ? dayScore(prevSundayIso) : null;

    let lastScoreBeforeWeek: PatientMoodScore | null = null;
    for (let i = 6; i >= 0; i -= 1) {
      const ymd = prevMonday.plus({ days: i }).toISODate();
      if (!ymd) continue;
      const sc = dayScore(ymd);
      if (sc != null) {
        lastScoreBeforeWeek = sc;
        break;
      }
    }

    return { days, previousSundayScore, lastScoreBeforeWeek };
  }

  return {
    getCheckinState,
    submitScore,
    getWeekSparkline,
    /** @deprecated Prefer `getCheckinState` (returns `mood` plus `lastEntry`). */
    async getToday(userId: string, tz: string): Promise<PatientMoodToday | null> {
      const s = await getCheckinState(userId, tz);
      return s.mood;
    },
  };
}

export type PatientMoodService = ReturnType<typeof createPatientMoodService>;
