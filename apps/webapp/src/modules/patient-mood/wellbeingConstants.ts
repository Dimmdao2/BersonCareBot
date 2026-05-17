/** Canonical `symptom_trackings.symptom_key` for home check-in / wellbeing diary row. */
export const GENERAL_WELLBEING_SYMPTOM_KEY = "general_wellbeing";

export const GENERAL_WELLBEING_TITLE = "Общее самочувствие";

export function isGeneralWellbeingTracking(symptomKey: string | null | undefined): boolean {
  return symptomKey === GENERAL_WELLBEING_SYMPTOM_KEY;
}

/** Inclusive upper bound for silent replace / «недавняя разминка» lookback: возраст последней записи ≤ 5 мин. */
export const WELLBEING_REPLACE_LAST_MAX_MS = 5 * 60 * 1000;

export type WellbeingResubmitKind = "replace_silent" | "new_only";

/** Клиент + сервер: только «≤5 мин — тихая ветка на сервере» vs новая запись. */
export function wellbeingResubmitKind(lastRecordedAtIso: string, nowMs = Date.now()): WellbeingResubmitKind {
  const ageMs = nowMs - new Date(lastRecordedAtIso).getTime();
  if (ageMs <= WELLBEING_REPLACE_LAST_MAX_MS) return "replace_silent";
  return "new_only";
}
