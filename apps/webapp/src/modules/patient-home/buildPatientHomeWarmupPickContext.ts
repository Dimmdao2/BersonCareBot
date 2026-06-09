import type { PatientHomeWarmupPickContext } from "@/modules/patient-home/todayConfig";

export type PatientHomeWarmupPickContextDeps = {
  patientPractice: {
    getLatestDailyWarmupCompletedContentPageId(userId: string): Promise<string | null>;
  };
};

export function buildPatientHomeWarmupPickContext(
  userId: string,
  deps: PatientHomeWarmupPickContextDeps,
): PatientHomeWarmupPickContext {
  return {
    tier: "patient",
    userId,
    getLatestCompletedContentPageId: deps.patientPractice.getLatestDailyWarmupCompletedContentPageId.bind(
      deps.patientPractice,
    ),
  };
}
