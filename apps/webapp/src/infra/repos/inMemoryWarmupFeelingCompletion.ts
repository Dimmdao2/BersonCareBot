import type { PatientPracticePort } from "@/modules/patient-practice/ports";
import type { WarmupFeelingCompletionPort } from "@/modules/patient-practice/warmupFeelingCompletionPort";

/** Упрощённая модель без таблицы симптомов: только обновление completion (dev / Vitest без Drizzle). */
const completionIdsWithAppliedSymptom = new Set<string>();

export function resetInMemoryWarmupFeelingCompletionForTests(): void {
  completionIdsWithAppliedSymptom.clear();
}

export function createInMemoryWarmupFeelingCompletionPort(opts: {
  completions: Pick<PatientPracticePort, "getByIdForUser" | "updateFeelingById">;
}): WarmupFeelingCompletionPort {
  return {
    async applyDailyWarmupFeeling(params) {
      const row = await opts.completions.getByIdForUser(params.completionId, params.userId);
      if (!row) return { duplicate: true };
      if (row.feeling !== null) return { duplicate: true };

      if (completionIdsWithAppliedSymptom.has(params.completionId)) {
        await opts.completions.updateFeelingById(params.completionId, params.userId, params.feeling);
        return { duplicate: true };
      }

      completionIdsWithAppliedSymptom.add(params.completionId);
      await opts.completions.updateFeelingById(params.completionId, params.userId, params.feeling);
      return { duplicate: false };
    },
  };
}
