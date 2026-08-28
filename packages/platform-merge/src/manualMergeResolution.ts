/**
 * Operator-selected resolution for `mergePlatformUsersInTransaction(..., "manual", { resolution })`.
 * `fields` covers the scalar columns an operator actually arbitrates. Track D (#987) retired the
 * public numeric identity, so there is no longer any identity column whose two non-null values
 * could block a merge; the remaining hard blocker is two real active treatment-program assignments.
 */
export type ScalarFieldWinner = 'target' | 'duplicate';

/** `both` is only valid for non-conflicting channels (auto-transfer of duplicate-only bindings). */
export type ChannelBindingWinner = 'target' | 'duplicate' | 'both';

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
  channelPreferences: 'keep_target' | 'keep_newer' | 'merge';
};

export function assertManualMergeResolutionIds(resolution: ManualMergeResolution): void {
  if (resolution.targetId === resolution.duplicateId) {
    throw new Error('manual merge: targetId and duplicateId must differ');
  }
}
