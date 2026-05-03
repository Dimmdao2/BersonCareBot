import { logger } from "@/app-layer/logging/logger";
import { enqueueMediaTranscodeJob } from "@/app-layer/media/mediaTranscodeJobs";
import { getConfigBool } from "@/modules/system-settings/configAdapter";

/**
 * Phase-06: после финализации новой загрузки (confirm / multipart complete), ставит job в
 * `media_transcode_jobs`, если **`video_hls_pipeline_enabled`** и **`video_hls_new_uploads_auto_transcode`**.
 *
 * Best-effort: не бросает наружу (ошибки enqueue не должны ломать upload flow / 5xx).
 * Идемпотентность: `enqueueMediaTranscodeJob` (одна активная job на media).
 */
export async function maybeAutoEnqueueVideoTranscodeAfterUpload(mediaId: string): Promise<void> {
  const pipelineOn = await getConfigBool("video_hls_pipeline_enabled", false);
  const autoOn = await getConfigBool("video_hls_new_uploads_auto_transcode", false);
  if (!pipelineOn || !autoOn) {
    return;
  }

  try {
    const out = await enqueueMediaTranscodeJob(mediaId);
    if (!out.ok) {
      if (out.error === "not_video") {
        return;
      }
      logger.warn({ mediaId, error: out.error }, "[media] auto_transcode_enqueue_skipped");
    }
  } catch (e) {
    logger.error({ err: e, mediaId }, "[media] auto_transcode_enqueue_failed");
  }
}
