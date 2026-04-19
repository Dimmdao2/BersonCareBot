import { mergeLogger as logger } from "./mergeLogger.js";
import { MergeConflictError, MergeDependentConflictError } from "./platformUserMergeErrors.js";

/**
 * Machine codes for merge guard / conflict outcomes (subset of messenger phone-bind / channel-link flows).
 */
export type MergeFailureClassificationCode =
  | "phone_owned_by_other_user"
  | "channel_already_bound_to_other_user"
  | "merge_blocked_booking_overlap"
  | "merge_blocked_distinct_real_users"
  | "merge_blocked_lfk_conflict"
  | "merge_blocked_ambiguous_candidates"
  | "merge_blocked_integrator_conflict"
  | "db_transient_failure";

export type MergeFailureClassification = {
  code: MergeFailureClassificationCode;
  candidateIds: string[];
};

/**
 * Maps engine errors to stable reason codes + candidate ids (integrator HTTP bind, channel-link, admin tooling).
 */
export function classifyMergeFailure(err: unknown, fallbackIds: string[]): MergeFailureClassification {
  const idsFromErr =
    err instanceof MergeConflictError || err instanceof MergeDependentConflictError
      ? err.candidateIds
      : fallbackIds;

  if (err instanceof MergeDependentConflictError) {
    const msg = err.message;
    if (msg.includes("patient_bookings: overlapping")) {
      return { code: "merge_blocked_booking_overlap", candidateIds: idsFromErr };
    }
    if (msg.includes("patient_lfk_assignments")) {
      return { code: "merge_blocked_lfk_conflict", candidateIds: idsFromErr };
    }
    if (msg.includes("shared-phone guard")) {
      return { code: "merge_blocked_distinct_real_users", candidateIds: idsFromErr };
    }
    return { code: "phone_owned_by_other_user", candidateIds: idsFromErr };
  }

  if (err instanceof MergeConflictError) {
    const msg = err.message;
    if (msg.includes("two different non-null integrator_user_id")) {
      return { code: "merge_blocked_integrator_conflict", candidateIds: idsFromErr };
    }
    if (msg.includes("two different non-null phone")) {
      return { code: "merge_blocked_distinct_real_users", candidateIds: idsFromErr };
    }
    return { code: "phone_owned_by_other_user", candidateIds: idsFromErr };
  }

  const pg = err as { code?: string };
  if (pg.code === "23505") {
    return { code: "channel_already_bound_to_other_user", candidateIds: fallbackIds };
  }

  logger.error({ err }, "[merge] unexpected merge failure");
  return { code: "db_transient_failure", candidateIds: fallbackIds };
}
