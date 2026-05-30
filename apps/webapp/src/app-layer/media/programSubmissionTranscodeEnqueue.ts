import { logger } from "@/app-layer/logging/logger";
import { markProgramSubmissionVideoProcessingFailed } from "@/app-layer/media/s3MediaStorage";
import { enqueueProgramSubmissionTranscodeJob } from "@/app-layer/media/mediaTranscodeJobs";

export type ProgramSubmissionTranscodeEnqueueResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * After patient program-submission confirm: enqueue 480p progressive transcode for video.
 * On failure marks `video_processing_status=failed` so attach/status stay blocked.
 */
export async function enqueueProgramSubmissionTranscodeAfterConfirm(
  mediaId: string,
): Promise<ProgramSubmissionTranscodeEnqueueResult> {
  try {
    const out = await enqueueProgramSubmissionTranscodeJob(mediaId);
    if (out.ok) return { ok: true };
    if (out.error === "not_video") return { ok: true };
    await markProgramSubmissionVideoProcessingFailed(mediaId, out.error);
    logger.warn({ mediaId, error: out.error }, "[media] program_submission_transcode_enqueue_failed");
    return { ok: false, error: out.error };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "enqueue_failed";
    await markProgramSubmissionVideoProcessingFailed(mediaId, msg);
    logger.error({ err: e, mediaId }, "[media] program_submission_transcode_enqueue_failed");
    return { ok: false, error: msg };
  }
}
