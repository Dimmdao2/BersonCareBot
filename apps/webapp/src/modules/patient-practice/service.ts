import type { PatientPracticeContentLookupPort, PatientPracticePort } from "./ports";
import type { PracticeSource, RecordPracticeInput, RecordPracticeResult } from "./types";

export function createPatientPracticeService(deps: {
  completions: PatientPracticePort;
  contentPages: PatientPracticeContentLookupPort;
}) {
  return {
    async record(input: RecordPracticeInput): Promise<RecordPracticeResult> {
      const page = await deps.contentPages.getById(input.contentPageId);
      if (!page || page.deletedAt || page.archivedAt || !page.isPublished) {
        return { ok: false, error: "invalid_content_page" };
      }
      const row = await deps.completions.record(input);
      return { ok: true, id: row.id };
    },

    async getProgress(userId: string, tz: string, todayTarget: number) {
      const [todayDone, streak] = await Promise.all([
        deps.completions.countToday(userId, tz),
        deps.completions.streak(userId, tz),
      ]);
      return { todayDone, todayTarget, streak };
    },

    async listRecent(userId: string, limit: number) {
      return deps.completions.listRecent(userId, limit);
    },
  };
}

export type PatientPracticeService = ReturnType<typeof createPatientPracticeService>;
