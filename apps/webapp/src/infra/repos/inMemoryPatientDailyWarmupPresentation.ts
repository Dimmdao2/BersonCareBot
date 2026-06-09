import type {
  DailyWarmupPresentationState,
  PatientDailyWarmupPresentationPort,
} from "@/modules/patient-home/dailyWarmupPresentationPorts";

export function createInMemoryPatientDailyWarmupPresentationPort(): PatientDailyWarmupPresentationPort {
  const byUser = new Map<string, DailyWarmupPresentationState>();
  return {
    async getPresentationState(userId) {
      return byUser.get(userId) ?? null;
    },
    async upsertPresentationState(userId, state) {
      byUser.set(userId, { ...state });
    },
    async getPresentedContentPageId(userId) {
      return byUser.get(userId)?.contentPageId ?? null;
    },
    async setPresentedContentPageId(userId, contentPageId) {
      const existing = byUser.get(userId);
      byUser.set(userId, {
        contentPageId,
        lastRotationAt: existing?.lastRotationAt ?? new Date().toISOString(),
        skipNextScheduledRotation: existing?.skipNextScheduledRotation ?? false,
      });
    },
  };
}
