import { sql } from "drizzle-orm";
import { check, date, pgTable, primaryKey, smallint, timestamp, uuid } from "drizzle-orm/pg-core";

export const patientDailyMood = pgTable(
  "patient_daily_mood",
  {
    userId: uuid("user_id").notNull(),
    moodDate: date("mood_date").notNull(),
    score: smallint("score").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.moodDate] }),
    check("pdm_score_check", sql`(score >= 1) AND (score <= 5)`),
  ],
);
