import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { logger } from "@/app-layer/logging/logger";
import {
  SUPPORT_UNDELIVERED_JOB_FAMILY,
  SUPPORT_UNDELIVERED_JOB_KEY,
  mergeUndeliveredSupportSubmissions,
  type UndeliveredSupportSubmission,
} from "@/modules/support/undeliveredSupportSubmissions";

/**
 * Edge seam (buildAppDeps at the edge, per this repo's clean-architecture convention — see
 * `reportEmptyNotificationAudience.ts` for the sibling pattern this mirrors). Called only when
 * `dispatchOperatorAlert` could not confirm delivery on any channel: the last line of defence
 * against losing a support submission's content (D-2).
 *
 * Never throws: this sits on the send path and must not turn a delivery failure into a 500.
 */
export async function persistUndeliveredSupportSubmission(
  submission: UndeliveredSupportSubmission,
): Promise<boolean> {
  try {
    const deps = buildAppDeps();
    const existing = await deps.operatorHealthRead.getOperatorJobStatus(
      SUPPORT_UNDELIVERED_JOB_FAMILY,
      SUPPORT_UNDELIVERED_JOB_KEY,
    );
    const merged = mergeUndeliveredSupportSubmissions(existing?.metaJson, submission);
    await deps.operatorHealthWrite.recordOperatorJobTickFailure({
      jobFamily: SUPPORT_UNDELIVERED_JOB_FAMILY,
      jobKey: SUPPORT_UNDELIVERED_JOB_KEY,
      startedAtIso: submission.at,
      durationMs: 0,
      error: `support_submission_undelivered:${submission.kind}`,
      metaJson: merged as unknown as Record<string, unknown>,
    });
    return true;
  } catch (err) {
    logger.error(
      { err, kind: submission.kind, scope: "support", event: "support_submission_persist_failed" },
      "[support] failed to persist undelivered submission — content may be lost",
    );
    return false;
  }
}
