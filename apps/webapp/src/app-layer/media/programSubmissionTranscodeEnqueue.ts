import { logger } from "@/app-layer/logging/logger";
import { enqueueProgramSubmissionTranscodeJob } from "@/app-layer/media/mediaTranscodeJobs";

/**
 * After patient program-submission confirm: enqueue 480p progressive transcode for video.
 * Best-effort — errors must not fail the upload confirm response.
 */
export async function enqueueProgramSubmissionTranscodeAfterConfirm(mediaId: string): Promise<void> {
  try {
    const out = await enqueueProgramSubmissionTranscodeJob(mediaId);
    if (!out.ok) {
      if (out.error === "not_video") return;
      logger.warn({ mediaId, error: out.error }, "[media] program_submission_transcode_enqueue_skipped");
    }
  } catch (e) {
    logger.error({ err: e, mediaId }, "[media] program_submission_transcode_enqueue_failed");
  }
}
