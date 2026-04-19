export type { ManualMergeResolution, ScalarFieldWinner, ChannelBindingWinner } from "./manualMergeResolution.js";
export { assertManualMergeResolutionIds } from "./manualMergeResolution.js";

export {
  MergeConflictError,
  MergeDependentConflictError,
} from "./platformUserMergeErrors.js";

export type {
  MergePlatformUsersReason,
  PickMergeTargetCandidate,
  PlatformMergeDbClient,
  VerifiedDistinctIntegratorUserIds,
} from "./pgPlatformUserMerge.js";

export {
  mergePlatformUsersInTransaction,
  pickMergeTargetId,
} from "./pgPlatformUserMerge.js";

export type {
  MessengerPhoneBindDb,
  MessengerPhoneLinkFailureCode,
} from "./messengerPhonePublicBind.js";

export {
  MessengerPhoneLinkError,
  applyMessengerPhonePublicBind,
} from "./messengerPhonePublicBind.js";

export type {
  MergeFailureClassification,
  MergeFailureClassificationCode,
} from "./mergeFailureClassification.js";

export { classifyMergeFailure } from "./mergeFailureClassification.js";
