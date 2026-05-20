import type { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import {
  loadWarmupPushDynamicContext,
  type LoadWarmupPushDynamicContextDeps,
} from "@/modules/web-push/loadWarmupPushDynamicContext";

type AppDeps = ReturnType<typeof buildAppDeps>;

export function createLoadWarmupPushContext(deps: AppDeps) {
  const loaderDeps: LoadWarmupPushDynamicContextDeps = {
    listRulesByUser: (userId) => deps.reminders.listRulesByUser(userId),
    listPracticeCompletionsInRange: async (userId, start, end) =>
      deps.patientPractice.listByUserInUtcRange(userId, start.toISOString(), end.toISOString()),
    patientHomeBlocks: deps.patientHomeBlocks,
    contentPages: deps.contentPages,
    contentSections: deps.contentSections,
    getPatientCalendarIana: (userId) => deps.patientCalendarTimezone.getIanaForUser(userId),
  };
  return (platformUserId: string) => loadWarmupPushDynamicContext(platformUserId, loaderDeps);
}
