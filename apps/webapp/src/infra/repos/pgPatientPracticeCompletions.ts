import { and, desc, eq, gte, lt } from "drizzle-orm";
import { DateTime } from "luxon";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { patientPracticeCompletions } from "../../../db/schema";
import { computePracticeStreak } from "@/modules/patient-practice/streakLogic";
import type { PatientPracticePort } from "@/modules/patient-practice/ports";
import type { PatientPracticeCompletionRow, RecordPracticeInput } from "@/modules/patient-practice/types";

function mapRow(row: typeof patientPracticeCompletions.$inferSelect): PatientPracticeCompletionRow {
  return {
    id: row.id,
    userId: row.userId,
    contentPageId: row.contentPageId,
    completedAt: row.completedAt,
    source: row.source as PatientPracticeCompletionRow["source"],
    feeling: row.feeling,
    notes: row.notes,
  };
}

export function createPgPatientPracticeCompletionsPort(): PatientPracticePort {
  return {
    async record(input: RecordPracticeInput) {
      const db = getDrizzle();
      const [row] = await db
        .insert(patientPracticeCompletions)
        .values({
          userId: input.userId,
          contentPageId: input.contentPageId,
          source: input.source,
          feeling: input.feeling ?? null,
          notes: input.notes ?? "",
        })
        .returning({ id: patientPracticeCompletions.id });
      if (!row) throw new Error("patient_practice_completions insert returned no row");
      return { id: row.id };
    },

    async countToday(userId, tz) {
      const todayStr = DateTime.now().setZone(tz).toISODate()!;
      const sinceUtc = DateTime.now().setZone(tz).minus({ days: 7 }).startOf("day").toUTC().toISO()!;
      const db = getDrizzle();
      const rows = await db
        .select({ completedAt: patientPracticeCompletions.completedAt })
        .from(patientPracticeCompletions)
        .where(and(eq(patientPracticeCompletions.userId, userId), gte(patientPracticeCompletions.completedAt, sinceUtc)));
      let n = 0;
      for (const r of rows) {
        const d = DateTime.fromISO(r.completedAt, { setZone: true }).setZone(tz).toISODate();
        if (d === todayStr) n += 1;
      }
      return n;
    },

    async streak(userId, tz) {
      const sinceUtc = DateTime.now().setZone(tz).minus({ days: 120 }).startOf("day").toUTC().toISO()!;
      const db = getDrizzle();
      const rows = await db
        .select({ completedAt: patientPracticeCompletions.completedAt })
        .from(patientPracticeCompletions)
        .where(and(eq(patientPracticeCompletions.userId, userId), gte(patientPracticeCompletions.completedAt, sinceUtc)));
      const dates = new Set<string>();
      for (const r of rows) {
        dates.add(DateTime.fromISO(r.completedAt, { setZone: true }).setZone(tz).toISODate()!);
      }
      return computePracticeStreak(dates, tz);
    },

    async getLatestDailyWarmupCompletionCompletedAt(userId, contentPageId) {
      const db = getDrizzle();
      const rows = await db
        .select({ completedAt: patientPracticeCompletions.completedAt })
        .from(patientPracticeCompletions)
        .where(
          and(
            eq(patientPracticeCompletions.userId, userId),
            eq(patientPracticeCompletions.contentPageId, contentPageId),
            eq(patientPracticeCompletions.source, "daily_warmup"),
          ),
        )
        .orderBy(desc(patientPracticeCompletions.completedAt))
        .limit(1);
      return rows[0]?.completedAt ?? null;
    },

    async listRecent(userId, limit) {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(patientPracticeCompletions)
        .where(eq(patientPracticeCompletions.userId, userId))
        .orderBy(desc(patientPracticeCompletions.completedAt))
        .limit(limit);
      return rows.map(mapRow);
    },

    async listByUserInUtcRange(userId, fromUtcIso, toUtcExclusiveIso) {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(patientPracticeCompletions)
        .where(
          and(
            eq(patientPracticeCompletions.userId, userId),
            gte(patientPracticeCompletions.completedAt, fromUtcIso),
            lt(patientPracticeCompletions.completedAt, toUtcExclusiveIso),
          ),
        )
        .orderBy(desc(patientPracticeCompletions.completedAt));
      return rows.map(mapRow);
    },

    async getByIdForUser(completionId, userId) {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(patientPracticeCompletions)
        .where(and(eq(patientPracticeCompletions.id, completionId), eq(patientPracticeCompletions.userId, userId)))
        .limit(1);
      const row = rows[0];
      return row ? mapRow(row) : null;
    },

    async updateFeelingById(completionId, userId, feeling) {
      const db = getDrizzle();
      const updated = await db
        .update(patientPracticeCompletions)
        .set({ feeling })
        .where(and(eq(patientPracticeCompletions.id, completionId), eq(patientPracticeCompletions.userId, userId)))
        .returning({ id: patientPracticeCompletions.id });
      return updated.length > 0;
    },
  };
}
