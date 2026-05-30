type DiscussionSettingKey =
  | "patient_program_discussion_ui_enabled"
  | "patient_program_discussion_media_submission_enabled";

export type DiscussionFeatureGateDeps = {
  systemSettings: {
    getSetting: (
      key: DiscussionSettingKey,
      scope: "admin",
    ) => Promise<{ valueJson: unknown } | null | undefined>;
  };
};

export function parseDiscussionFeatureEnabled(valueJson: unknown): boolean {
  return (
    valueJson !== null &&
    typeof valueJson === "object" &&
    (valueJson as Record<string, unknown>).value === true
  );
}

export async function isPatientProgramDiscussionUiEnabled(
  deps: DiscussionFeatureGateDeps,
): Promise<boolean> {
  const row = await deps.systemSettings.getSetting("patient_program_discussion_ui_enabled", "admin");
  return parseDiscussionFeatureEnabled(row?.valueJson ?? null);
}

export async function isPatientProgramDiscussionMediaSubmissionEnabled(
  deps: DiscussionFeatureGateDeps,
): Promise<boolean> {
  const row = await deps.systemSettings.getSetting(
    "patient_program_discussion_media_submission_enabled",
    "admin",
  );
  return parseDiscussionFeatureEnabled(row?.valueJson ?? null);
}

/** Media upload + attach require both rollout flags (P23). */
export async function isPatientProgramDiscussionMediaFlowEnabled(
  deps: DiscussionFeatureGateDeps,
): Promise<boolean> {
  const [ui, media] = await Promise.all([
    isPatientProgramDiscussionUiEnabled(deps),
    isPatientProgramDiscussionMediaSubmissionEnabled(deps),
  ]);
  return ui && media;
}
