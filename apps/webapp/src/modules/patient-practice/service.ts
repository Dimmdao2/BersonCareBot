import type { PatientPracticeContentLookupPort, PatientPracticePort } from "./ports";
import type {
  DailyWarmupHeroCooldownMeta,
  PatientPracticeCompletionRow,
  RecordPracticeInput,
  RecordPracticeResult,
} from "./types";

function buildDailyWarmupHeroCooldownMeta(
  latestIso: string | null,
  cooldownMinutes: number,
  nowMs: number,
): DailyWarmupHeroCooldownMeta {
  if (!latestIso) return { active: false };
  const t = new Date(latestIso).getTime();
  if (!Number.isFinite(t)) return { active: false };
  const elapsed = nowMs - t;
  const cooldownMs = cooldownMinutes * 60 * 1000;
  if (elapsed < 0 || elapsed >= cooldownMs) return { active: false };
  const minutesAgo = Math.floor(elapsed / 60_000);
  const remMs = cooldownMs - elapsed;
  const minutesRemaining = Math.max(1, Math.ceil(remMs / 60_000));
  return { active: true, minutesAgo, minutesRemaining };
}

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

    /**
     * Главная «Сегодня»: cooldown после `daily_warmup` для текущей страницы разминки (hero + подпись).
     */
    async getDailyWarmupHeroCooldownMeta(
      userId: string,
      contentPageId: string,
      cooldownMinutes: number,
    ): Promise<DailyWarmupHeroCooldownMeta> {
      const latestIso = await deps.completions.getLatestDailyWarmupCompletionCompletedAt(userId, contentPageId);
      return buildDailyWarmupHeroCooldownMeta(latestIso, cooldownMinutes, Date.now());
    },

    async listRecent(userId: string, limit: number) {
      return deps.completions.listRecent(userId, limit);
    },

    async getCompletionByIdForUser(completionId: string, userId: string): Promise<PatientPracticeCompletionRow | null> {
      return deps.completions.getByIdForUser(completionId, userId);
    },

    async updateCompletionFeelingById(completionId: string, userId: string, feeling: number): Promise<boolean> {
      return deps.completions.updateFeelingById(completionId, userId, feeling);
    },
  };
}

export type PatientPracticeService = ReturnType<typeof createPatientPracticeService>;
