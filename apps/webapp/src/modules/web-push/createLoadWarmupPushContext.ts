import {
  loadWarmupPushDynamicContext,
  type LoadWarmupPushDynamicContextDeps,
} from "@/modules/web-push/loadWarmupPushDynamicContext";

/** Narrow deps slice for warmup push (avoids importing composition root). */
export type LoadWarmupPushContextDeps = {
  reminders: { listRulesByUser: LoadWarmupPushDynamicContextDeps["listRulesByUser"] };
  patientPractice: {
    listByUserInUtcRange: (
      userId: string,
      startIso: string,
      endIso: string,
    ) => Promise<Awaited<ReturnType<LoadWarmupPushDynamicContextDeps["listPracticeCompletionsInRange"]>>>;
    getLatestDailyWarmupCompletedContentPageId: LoadWarmupPushDynamicContextDeps["getLatestDailyWarmupCompletedContentPageId"];
  };
  patientDailyWarmupPresentation: {
    getPresentedContentPageId: LoadWarmupPushDynamicContextDeps["getPresentedDailyWarmupContentPageId"];
  };
  patientHomeBlocks: LoadWarmupPushDynamicContextDeps["patientHomeBlocks"];
  contentPages: LoadWarmupPushDynamicContextDeps["contentPages"];
  contentSections: LoadWarmupPushDynamicContextDeps["contentSections"];
  patientCalendarTimezone: { getIanaForUser: LoadWarmupPushDynamicContextDeps["getPatientCalendarIana"] };
};

export function createLoadWarmupPushContext(deps: LoadWarmupPushContextDeps) {
  const loaderDeps: LoadWarmupPushDynamicContextDeps = {
    listRulesByUser: (userId) => deps.reminders.listRulesByUser(userId),
    listPracticeCompletionsInRange: async (userId, start, end) =>
      deps.patientPractice.listByUserInUtcRange(userId, start.toISOString(), end.toISOString()),
    patientHomeBlocks: deps.patientHomeBlocks,
    contentPages: deps.contentPages,
    contentSections: deps.contentSections,
    getPatientCalendarIana: (userId) => deps.patientCalendarTimezone.getIanaForUser(userId),
    getLatestDailyWarmupCompletedContentPageId: (userId) =>
      deps.patientPractice.getLatestDailyWarmupCompletedContentPageId(userId),
    getPresentedDailyWarmupContentPageId: (userId) =>
      deps.patientDailyWarmupPresentation.getPresentedContentPageId(userId),
  };
  return (platformUserId: string) => loadWarmupPushDynamicContext(platformUserId, loaderDeps);
}
