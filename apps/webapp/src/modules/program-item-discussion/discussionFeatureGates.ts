import type { RuntimeConfigContext } from "@/modules/system-settings/runtimeConfig";

type DiscussionSettingKey =
  | "patient_program_discussion_ui_enabled"
  | "patient_program_discussion_media_submission_enabled";

export type DiscussionFeatureGateDeps = {
  runtimeConfig: {
    getBoolean: (key: DiscussionSettingKey, context: RuntimeConfigContext) => Promise<boolean>;
  };
};

export async function isPatientProgramDiscussionUiEnabled(
  deps: DiscussionFeatureGateDeps,
  context: RuntimeConfigContext,
): Promise<boolean> {
  return deps.runtimeConfig.getBoolean("patient_program_discussion_ui_enabled", context);
}

export async function isPatientProgramDiscussionMediaSubmissionEnabled(
  deps: DiscussionFeatureGateDeps,
  context: RuntimeConfigContext,
): Promise<boolean> {
  return deps.runtimeConfig.getBoolean(
    "patient_program_discussion_media_submission_enabled",
    context,
  );
}

/** Media upload + attach require both rollout flags (P23). */
export async function isPatientProgramDiscussionMediaFlowEnabled(
  deps: DiscussionFeatureGateDeps,
  context: RuntimeConfigContext,
): Promise<boolean> {
  const [ui, media] = await Promise.all([
    isPatientProgramDiscussionUiEnabled(deps, context),
    isPatientProgramDiscussionMediaSubmissionEnabled(deps, context),
  ]);
  return ui && media;
}
