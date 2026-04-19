/**
 * Platform user merge engine — implemented in `@bersoncare/platform-merge` (shared with integrator).
 */
export type {
  ManualMergeResolution,
  MergePlatformUsersReason,
  PickMergeTargetCandidate,
  VerifiedDistinctIntegratorUserIds,
} from "@bersoncare/platform-merge";

export { mergePlatformUsersInTransaction, pickMergeTargetId } from "@bersoncare/platform-merge";
