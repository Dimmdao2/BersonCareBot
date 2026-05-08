import { DateTime } from "luxon";
import type { ReferencesPort } from "@/modules/references/ports";
import type { createSymptomDiaryService } from "@/modules/diaries/symptom-service";
import { getMoodDateForTimeZone } from "./moodDate";
import {
  GENERAL_WELLBEING_SYMPTOM_KEY,
  GENERAL_WELLBEING_TITLE,
  WELLBEING_MODAL_WINDOW_MAX_MS,
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
} from "./types";
import { isPatientMoodScore } from "./types";

type SymptomDiary = ReturnType<typeof createSymptomDiaryService>;

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
    const trackings = await deps.diaries.listTrackings(userId, false);
    const existing = trackings.find((t) => t.symptomKey === GENERAL_WELLBEING_SYMPTOM_KEY);
    if (existing) return existing.id;
    const refId = await wellbeingTypeRefId();
    const t = await deps.diaries.createTracking({
      userId,
      symptomKey: GENERAL_WELLBEING_SYMPTOM_KEY,
      symptomTitle: GENERAL_WELLBEING_TITLE,
      symptomTypeRefId: refId,
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

  async function submitScore(
    userId: string,
    tz: string,
    score: number,
    intent: PatientMoodIntent,
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
      await deps.diaries.updateSymptomEntry({
        userId,
        entryId: last.id,
        value0_10: score,
        entryType: "instant",
        recordedAt: last.recordedAt,
        notes: null,
      });
      return { ok: true, ...(await getCheckinState(userId, tz)) };
    }

    if (ageMs <= WELLBEING_MODAL_WINDOW_MAX_MS) {
      if (intent === "auto") {
        return { ok: false, error: "intent_required", lastEntry: last };
      }
      if (intent === "replace_last") {
        await deps.diaries.updateSymptomEntry({
          userId,
          entryId: last.id,
          value0_10: score,
          entryType: "instant",
          recordedAt: nowIso,
          notes: null,
        });
        return { ok: true, ...(await getCheckinState(userId, tz)) };
      }
      if (intent === "new_instant") {
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
      return { ok: false, error: "invalid_intent" };
    }

    if (intent === "replace_last") {
      return { ok: false, error: "replace_too_old" };
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

  async function getWeekSparkline(userId: string, tz: string): Promise<PatientMoodWeekDay[]> {
    const trackingId = await ensureWellbeingTracking(userId);
    const todayStart = DateTime.now().setZone(tz).startOf("day");
    const dayKeys: string[] = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = todayStart.minus({ days: i }).toISODate();
      if (d) dayKeys.push(d);
    }
    if (dayKeys.length === 0) return [];
    const from = localDayRangeUtcIso(tz, dayKeys[0]!).from;
    const toExclusive = localDayRangeUtcIso(tz, dayKeys[dayKeys.length - 1]!).toExclusive;
    const entries = await deps.diaries.listSymptomEntriesForTrackingInRange({
      userId,
      trackingId,
      fromRecordedAt: from,
      toRecordedAtExclusive: toExclusive,
    });

    const best = new Map<string, { recordedAt: string; score: PatientMoodScore }>();
    for (const e of entries) {
      const localD = DateTime.fromISO(e.recordedAt, { zone: "utc" }).setZone(tz).toISODate();
      if (!localD) continue;
      const score = toMoodScore(e.value0_10);
      if (score == null) continue;
      const cur = best.get(localD);
      if (!cur || new Date(e.recordedAt) > new Date(cur.recordedAt)) {
        best.set(localD, { recordedAt: e.recordedAt, score });
      }
    }

    return dayKeys.map((d) => ({
      date: d,
      score: best.get(d)?.score ?? null,
      warmupHint: null,
    }));
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
