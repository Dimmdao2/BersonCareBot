export const PATIENT_MOOD_SCORES = [1, 2, 3, 4, 5] as const;

export type PatientMoodScore = (typeof PATIENT_MOOD_SCORES)[number];

export type PatientMoodToday = {
  moodDate: string;
  score: PatientMoodScore;
};

export type PatientMoodLastEntry = {
  id: string;
  recordedAt: string;
  /** `null` если в БД `value_0_10` вне шкалы 1–5 (редкий сбой данных); окно «тихой» ветки по `recordedAt` этой строки. */
  score: PatientMoodScore | null;
  /** `symptom_entries.notes` (например маркер дубля после разминки). */
  notes?: string | null;
};

export type PatientMoodCheckinState = {
  mood: PatientMoodToday | null;
  lastEntry: PatientMoodLastEntry | null;
};

export type PatientMoodIntent = "auto" | "replace_last" | "new_instant";

export type PatientMoodSubmitResult =
  | ({ ok: true } & PatientMoodCheckinState)
  | { ok: false; error: "invalid_score" };

/** One local calendar day in app TZ (for home sparkline / weekly strip). */
export type PatientMoodWeekDay = {
  date: string;
  score: PatientMoodScore | null;
  /** Reserved for correlation with daily warmup / practice (future). */
  warmupHint: null;
  /** Reserved for diary-notes annotations on the strip (future). */
  diaryNoteHint: null;
};

/** Mon–Sun sparkline plus bridge from the previous calendar week (home strip). */
export type PatientMoodWeekSparkline = {
  days: PatientMoodWeekDay[];
  /** Daily average on the Sunday immediately before this week (in tz), if any. */
  previousSundayScore: PatientMoodScore | null;
  /** Daily average on the latest prior local day with data before this week's Monday, if any. */
  lastScoreBeforeWeek: PatientMoodScore | null;
};

export function isPatientMoodScore(value: number): value is PatientMoodScore {
  return PATIENT_MOOD_SCORES.includes(value as PatientMoodScore);
}
