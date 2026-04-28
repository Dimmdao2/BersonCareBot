import { and, eq, sql } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { patientDailyMood } from "../../../db/schema";
import type { PatientMoodPort } from "@/modules/patient-mood/ports";
import type { PatientMoodRow, PatientMoodScore } from "@/modules/patient-mood/types";

function mapRow(row: typeof patientDailyMood.$inferSelect): PatientMoodRow {
  return {
    userId: row.userId,
    moodDate: row.moodDate,
    score: row.score as PatientMoodScore,
  };
}

export function createPgPatientDailyMoodPort(): PatientMoodPort {
  return {
    async upsertForDate(input) {
      const db = getDrizzle();
      const [row] = await db
        .insert(patientDailyMood)
        .values({
          userId: input.userId,
          moodDate: input.moodDate,
          score: input.score,
        })
        .onConflictDoUpdate({
          target: [patientDailyMood.userId, patientDailyMood.moodDate],
          set: {
            score: input.score,
            updatedAt: sql`now()` as unknown as string,
          },
        })
        .returning();
      if (!row) throw new Error("patient_daily_mood upsert returned no row");
      return mapRow(row);
    },

    async getForDate(userId, moodDate) {
      const db = getDrizzle();
      const [row] = await db
        .select()
        .from(patientDailyMood)
        .where(and(eq(patientDailyMood.userId, userId), eq(patientDailyMood.moodDate, moodDate)))
        .limit(1);
      return row ? mapRow(row) : null;
    },
  };
}
