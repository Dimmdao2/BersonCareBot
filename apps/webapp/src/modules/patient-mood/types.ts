export const PATIENT_MOOD_SCORES = [1, 2, 3, 4, 5] as const;

export type PatientMoodScore = (typeof PATIENT_MOOD_SCORES)[number];

export type PatientMoodToday = {
  moodDate: string;
  score: PatientMoodScore;
};

export type PatientMoodRow = PatientMoodToday & {
  userId: string;
};

export function isPatientMoodScore(value: number): value is PatientMoodScore {
  return PATIENT_MOOD_SCORES.includes(value as PatientMoodScore);
}
