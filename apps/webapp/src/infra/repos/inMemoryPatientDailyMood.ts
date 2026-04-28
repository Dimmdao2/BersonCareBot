import type { PatientMoodPort } from "@/modules/patient-mood/ports";
import type { PatientMoodRow } from "@/modules/patient-mood/types";

const rows = new Map<string, PatientMoodRow>();

function keyFor(userId: string, moodDate: string): string {
  return `${userId}:${moodDate}`;
}

export function resetInMemoryPatientDailyMoodForTests() {
  rows.clear();
}

export function createInMemoryPatientDailyMoodPort(): PatientMoodPort {
  return {
    async upsertForDate(input) {
      const row: PatientMoodRow = {
        userId: input.userId,
        moodDate: input.moodDate,
        score: input.score,
      };
      rows.set(keyFor(input.userId, input.moodDate), row);
      return row;
    },

    async getForDate(userId, moodDate) {
      return rows.get(keyFor(userId, moodDate)) ?? null;
    },
  };
}
