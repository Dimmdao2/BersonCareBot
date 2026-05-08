/** Canonical `symptom_trackings.symptom_key` for home check-in / wellbeing diary row. */
export const GENERAL_WELLBEING_SYMPTOM_KEY = "general_wellbeing";

export const GENERAL_WELLBEING_TITLE = "Общее самочувствие";

export function isGeneralWellbeingTracking(symptomKey: string | null | undefined): boolean {
  return symptomKey === GENERAL_WELLBEING_SYMPTOM_KEY;
}

/** Inclusive upper bound for silent replace: age from `recorded_at` ≤ 10 min (план: «≤ 10 минут»). */
export const WELLBEING_REPLACE_LAST_MAX_MS = 10 * 60 * 1000;

/** Inclusive upper bound for modal window: age ≤ 60 min and > 10 min (план: «> 10 и ≤ 60 минут»). */
export const WELLBEING_MODAL_WINDOW_MAX_MS = 60 * 60 * 1000;

export type WellbeingResubmitKind = "replace_silent" | "modal" | "new_only";

/** Client + server alignment for 10m / 60m windows (last entry `recorded_at` vs now). */
export function wellbeingResubmitKind(lastRecordedAtIso: string, nowMs = Date.now()): WellbeingResubmitKind {
  const ageMs = nowMs - new Date(lastRecordedAtIso).getTime();
  if (ageMs <= WELLBEING_REPLACE_LAST_MAX_MS) return "replace_silent";
  if (ageMs <= WELLBEING_MODAL_WINDOW_MAX_MS) return "modal";
  return "new_only";
}
