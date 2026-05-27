import type { PatientDailyWarmupPresentationPort } from "@/modules/patient-home/dailyWarmupPresentationPorts";

export function createInMemoryPatientDailyWarmupPresentationPort(): PatientDailyWarmupPresentationPort {
  const byUser = new Map<string, string>();
  return {
    async getPresentedContentPageId(userId) {
      return byUser.get(userId) ?? null;
    },
    async setPresentedContentPageId(userId, contentPageId) {
      byUser.set(userId, contentPageId);
    },
  };
}
