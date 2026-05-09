import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import { computePracticeStreak } from "@/modules/patient-practice/streakLogic";
import type { PatientPracticePort } from "@/modules/patient-practice/ports";
import type { PatientPracticeCompletionRow, RecordPracticeInput } from "@/modules/patient-practice/types";

const rows: PatientPracticeCompletionRow[] = [];

export function resetInMemoryPatientPracticeCompletionsForTests() {
  rows.length = 0;
}

export function createInMemoryPatientPracticeCompletionsPort(): PatientPracticePort {
  return {
    async record(input: RecordPracticeInput) {
      const id = randomUUID();
      const completedAt = new Date().toISOString();
      rows.push({
        id,
        userId: input.userId,
        contentPageId: input.contentPageId,
        completedAt,
        source: input.source,
        feeling: input.feeling ?? null,
        notes: input.notes ?? "",
      });
      return { id };
    },

    async countToday(userId, tz) {
      const todayStr = DateTime.now().setZone(tz).toISODate()!;
      let n = 0;
      for (const r of rows) {
        if (r.userId !== userId) continue;
        const d = DateTime.fromISO(r.completedAt, { setZone: true }).setZone(tz).toISODate();
        if (d === todayStr) n += 1;
      }
      return n;
    },

    async streak(userId, tz) {
      const dates = new Set<string>();
      for (const r of rows) {
        if (r.userId !== userId) continue;
        dates.add(DateTime.fromISO(r.completedAt, { setZone: true }).setZone(tz).toISODate()!);
      }
      return computePracticeStreak(dates, tz);
    },

    async getLatestDailyWarmupCompletionCompletedAt(userId, contentPageId) {
      let latest: string | null = null;
      for (const r of rows) {
        if (r.userId !== userId || r.contentPageId !== contentPageId || r.source !== "daily_warmup") continue;
        if (!latest || r.completedAt > latest) latest = r.completedAt;
      }
      return latest;
    },

    async listRecent(userId, limit) {
      return rows
        .filter((r) => r.userId === userId)
        .sort((a, b) => (a.completedAt < b.completedAt ? 1 : -1))
        .slice(0, limit);
    },

    async listByUserInUtcRange(userId, fromUtcIso, toUtcExclusiveIso) {
      return rows
        .filter(
          (r) =>
            r.userId === userId && r.completedAt >= fromUtcIso && r.completedAt < toUtcExclusiveIso,
        )
        .sort((a, b) => (a.completedAt < b.completedAt ? 1 : -1));
    },

    async getByIdForUser(completionId, userId) {
      const row = rows.find((r) => r.id === completionId && r.userId === userId);
      return row ?? null;
    },

    async updateFeelingById(completionId, userId, feeling) {
      const row = rows.find((r) => r.id === completionId && r.userId === userId);
      if (!row) return false;
      row.feeling = feeling;
      return true;
    },
  };
}
