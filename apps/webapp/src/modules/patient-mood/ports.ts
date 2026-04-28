import type { PatientMoodRow, PatientMoodScore } from "./types";

export type PatientMoodPort = {
  upsertForDate(input: {
    userId: string;
    moodDate: string;
    score: PatientMoodScore;
  }): Promise<PatientMoodRow>;
  getForDate(userId: string, moodDate: string): Promise<PatientMoodRow | null>;
};
