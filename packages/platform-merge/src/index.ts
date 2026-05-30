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
  MergeContactsSaved,
} from "./pgPlatformUserMerge.js";

export {
  mergePlatformUsersInTransaction,
  pickMergeTargetId,
  enrichPickMergeCandidatesWithBookingCounts,
} from "./pgPlatformUserMerge.js";

export {
  collectMergeLosingContacts,
  type MergeContactFallbackCandidate,
} from "./mergeContactFallback.js";

export {
  normalizeRuPhoneE164,
  normalizeSupplementaryContactEmail,
  normalizeSupplementaryContactPhone,
} from "./supplementaryContactNormalize.js";

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

export type {
  BuildMessengerBindBlockedRelayLinesInput,
  MessengerBindAuditCandidateSummary,
  MessengerBindAuditInitiatorSummary,
} from "./messengerBindAuditPresentation.js";

export {
  buildMessengerBindBlockedRelayLines,
  messengerChannelLabelRu,
  messengerPhoneBindReasonHumanRu,
} from "./messengerBindAuditPresentation.js";

export { enrichMessengerBindAuditDetailsFields } from "./messengerBindAuditEnrichment.js";
export type { EnrichMessengerBindAuditDetailsArgs } from "./messengerBindAuditEnrichment.js";
