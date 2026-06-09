import type { DailyWarmupPresentationSyncDeps } from "@/modules/patient-home/ensureDailyWarmupPresentationSynced";

export function buildDailyWarmupPresentationSyncDeps(deps: {
  patientHomeBlocks: DailyWarmupPresentationSyncDeps["patientHomeBlocks"];
  contentPages: DailyWarmupPresentationSyncDeps["contentPages"];
  contentSections: DailyWarmupPresentationSyncDeps["contentSections"];
  systemSettings: DailyWarmupPresentationSyncDeps["systemSettings"];
  patientDailyWarmupPresentation: DailyWarmupPresentationSyncDeps["patientDailyWarmupPresentation"];
  patientPractice: DailyWarmupPresentationSyncDeps["patientPractice"];
  patientCalendarTimezone: DailyWarmupPresentationSyncDeps["patientCalendarTimezone"];
}): DailyWarmupPresentationSyncDeps {
  return {
    patientHomeBlocks: deps.patientHomeBlocks,
    contentPages: deps.contentPages,
    contentSections: deps.contentSections,
    systemSettings: deps.systemSettings,
    patientDailyWarmupPresentation: deps.patientDailyWarmupPresentation,
    patientPractice: deps.patientPractice,
    patientCalendarTimezone: deps.patientCalendarTimezone,
  };
}
