import type { PatientMoodPort } from "./ports";
import type { PatientMoodScore, PatientMoodToday } from "./types";
import { isPatientMoodScore } from "./types";
import { getMoodDateForTimeZone } from "./moodDate";

export function createPatientMoodService(port: PatientMoodPort) {
  return {
    async upsertToday(userId: string, tz: string, score: number): Promise<PatientMoodToday> {
      if (!Number.isInteger(score) || !isPatientMoodScore(score)) {
        throw new Error("invalid_mood_score");
      }
      const moodDate = getMoodDateForTimeZone(tz);
      const row = await port.upsertForDate({ userId, moodDate, score: score as PatientMoodScore });
      return { moodDate: row.moodDate, score: row.score };
    },

    async getToday(userId: string, tz: string): Promise<PatientMoodToday | null> {
      const moodDate = getMoodDateForTimeZone(tz);
      const row = await port.getForDate(userId, moodDate);
      return row ? { moodDate: row.moodDate, score: row.score } : null;
    },
  };
}

export type PatientMoodService = ReturnType<typeof createPatientMoodService>;
