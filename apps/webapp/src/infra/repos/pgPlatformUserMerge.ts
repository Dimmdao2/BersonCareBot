/**
 * Platform user merge engine — implemented in `@bersoncare/platform-merge` (shared with integrator).
 */
export type {
  ManualMergeResolution,
  MergePlatformUsersReason,
  PickMergeTargetCandidate,
  VerifiedDistinctIntegratorUserIds,
} from "@bersoncare/platform-merge";

export { mergePlatformUsersInTransaction, pickMergeTargetId, enrichPickMergeCandidatesWithBookingCounts } from "@bersoncare/platform-merge";
