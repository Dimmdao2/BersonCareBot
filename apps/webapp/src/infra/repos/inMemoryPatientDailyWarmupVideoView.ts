import type { PatientDailyWarmupVideoViewPort } from "@/modules/patient-home/dailyWarmupVideoViewPorts";

export type InMemoryDailyWarmupVideoViewRow = {
  userId: string;
  contentPageId: string;
  viewedAt: string;
};

const rows: InMemoryDailyWarmupVideoViewRow[] = [];

export function resetInMemoryPatientDailyWarmupVideoViewsForTests() {
  rows.length = 0;
}

export function createInMemoryPatientDailyWarmupVideoViewPort(): PatientDailyWarmupVideoViewPort {
  return {
    async recordView(userId, contentPageId) {
      rows.push({ userId, contentPageId, viewedAt: new Date().toISOString() });
    },
  };
}
