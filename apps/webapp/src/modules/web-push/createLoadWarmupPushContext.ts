import { buildDailyWarmupPresentationSyncDeps } from '@/modules/patient-home/buildDailyWarmupPresentationSyncDeps';
import type { DailyWarmupPresentationSyncDeps } from '@/modules/patient-home/ensureDailyWarmupPresentationSynced';
import {
  loadWarmupPushDynamicContext,
  type LoadWarmupPushDynamicContextDeps,
} from '@/modules/web-push/loadWarmupPushDynamicContext';

/** Narrow deps slice for warmup push (avoids importing composition root). */
export type LoadWarmupPushContextDeps = {
  reminders: { listRulesByUser: LoadWarmupPushDynamicContextDeps['listRulesByUser'] };
  patientPractice: {
    listByUserInUtcRange: (
      userId: string,
      startIso: string,
      endIso: string,
    ) => Promise<
      Awaited<ReturnType<LoadWarmupPushDynamicContextDeps['listPracticeCompletionsInRange']>>
    >;
    getLatestDailyWarmupCompletedContentPageId: LoadWarmupPushDynamicContextDeps['getLatestDailyWarmupCompletedContentPageId'];
  };
  patientDailyWarmupPresentation: DailyWarmupPresentationSyncDeps['patientDailyWarmupPresentation'];
  patientHomeBlocks: DailyWarmupPresentationSyncDeps['patientHomeBlocks'];
  contentPages: DailyWarmupPresentationSyncDeps['contentPages'];
  contentSections: DailyWarmupPresentationSyncDeps['contentSections'];
  systemSettings: DailyWarmupPresentationSyncDeps['systemSettings'];
  patientCalendarTimezone: {
    getIanaForUser: LoadWarmupPushDynamicContextDeps['getPatientCalendarIana'];
  };
};

export function createLoadWarmupPushContext(
  deps: LoadWarmupPushContextDeps,
  options: { canMaterializePresentation: (userId: string) => Promise<boolean> },
) {
  const readOnlyLoaderDeps: LoadWarmupPushDynamicContextDeps = {
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
  const presentationSyncDeps = buildDailyWarmupPresentationSyncDeps({
    patientHomeBlocks: deps.patientHomeBlocks,
    contentPages: deps.contentPages,
    contentSections: deps.contentSections,
    systemSettings: deps.systemSettings,
    patientDailyWarmupPresentation: deps.patientDailyWarmupPresentation,
    patientPractice: deps.patientPractice,
    patientCalendarTimezone: deps.patientCalendarTimezone,
  });
  return async (platformUserId: string) => {
    const loaderDeps = (await options.canMaterializePresentation(platformUserId))
      ? { ...readOnlyLoaderDeps, presentationSyncDeps }
      : readOnlyLoaderDeps;
    return loadWarmupPushDynamicContext(platformUserId, loaderDeps);
  };
}
