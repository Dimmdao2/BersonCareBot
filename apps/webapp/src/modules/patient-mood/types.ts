export const PATIENT_MOOD_SCORES = [1, 2, 3, 4, 5] as const;

export type PatientMoodScore = (typeof PATIENT_MOOD_SCORES)[number];

export type PatientMoodToday = {
  moodDate: string;
  score: PatientMoodScore;
};

export type PatientMoodLastEntry = {
  id: string;
  recordedAt: string;
  /** `null` если в БД `value_0_10` вне шкалы 1–5 (редкий сбой данных); правила 10/60 мин всё равно по `recordedAt` этой строки. */
  score: PatientMoodScore | null;
};

export type PatientMoodCheckinState = {
  mood: PatientMoodToday | null;
  lastEntry: PatientMoodLastEntry | null;
};

export type PatientMoodIntent = "auto" | "replace_last" | "new_instant";

export type PatientMoodSubmitResult =
  | ({ ok: true } & PatientMoodCheckinState)
  | { ok: false; error: "invalid_score" | "invalid_intent" | "replace_too_old" }
  | { ok: false; error: "intent_required"; lastEntry: PatientMoodLastEntry };

/** One local calendar day in app TZ (for home sparkline / weekly strip). */
export type PatientMoodWeekDay = {
  date: string;
  score: PatientMoodScore | null;
  /** Reserved for correlation with daily warmup / practice (future). */
  warmupHint: null;
};

export function isPatientMoodScore(value: number): value is PatientMoodScore {
  return PATIENT_MOOD_SCORES.includes(value as PatientMoodScore);
}
