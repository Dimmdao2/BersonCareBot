/**
 * Operator-selected resolution for `mergePlatformUsersInTransaction(..., "manual", { resolution })`.
 * `integrator_user_id` is not part of `fields`: two different non-null integrator ids remain a hard blocker in the merge engine.
 */
export type ScalarFieldWinner = "target" | "duplicate";

/** `both` is only valid for non-conflicting channels (auto-transfer of duplicate-only bindings). */
export type ChannelBindingWinner = "target" | "duplicate" | "both";

export type ManualMergeResolution = {
  targetId: string;
  duplicateId: string;
  fields: {
    phone_normalized: ScalarFieldWinner;
    display_name: ScalarFieldWinner;
    first_name: ScalarFieldWinner;
    last_name: ScalarFieldWinner;
    email: ScalarFieldWinner;
  };
  bindings: {
    telegram: ChannelBindingWinner;
    max: ChannelBindingWinner;
    /** DB allows `vk` channel; include when preview shows vk conflict */
    vk: ChannelBindingWinner;
  };
  /** Per OAuth provider (e.g. `google`): winner when both users have a binding with different `provider_user_id`. */
  oauth: Record<string, ScalarFieldWinner>;
  channelPreferences: "keep_target" | "keep_newer" | "merge";
};

export function assertManualMergeResolutionIds(resolution: ManualMergeResolution): void {
  if (resolution.targetId === resolution.duplicateId) {
    throw new Error("manual merge: targetId and duplicateId must differ");
  }
}
