import type { VideoProcessingStatus } from './types';

/**
 * HLS readiness is the only input to video delivery: there is no user- or admin-selectable
 * strategy and no MP4 fallback once the transcode is ready (the uploaded source object is
 * deleted at that point — see `apps/media-worker/src/processTranscodeJob.ts`).
 */
export function isHlsAssetReady(
  videoProcessingStatus: VideoProcessingStatus | null,
  hlsMasterPlaylistS3Key: string | null,
): boolean {
  return videoProcessingStatus === 'ready' && Boolean(hlsMasterPlaylistS3Key?.trim());
}
