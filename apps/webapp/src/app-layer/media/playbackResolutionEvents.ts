import { logger } from '@/app-layer/logging/logger';
import { insertPlaybackResolutionEvent } from '@/infra/repos/pgPlaybackResolutionEvents';
import type { PlaybackStatDelivery } from '@/app-layer/media/playbackStatsHourly';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Per-user playback resolve event for doctor analytics (best-effort; never throws). */
export async function recordPlaybackResolutionEvent(input: {
  userId: string;
  mediaId: string;
  delivery: PlaybackStatDelivery;
}): Promise<void> {
  if (!UUID.test(input.userId) || !UUID.test(input.mediaId)) return;

  try {
    await insertPlaybackResolutionEvent(input);
  } catch (e) {
    logger.error({ err: e, mediaId: input.mediaId }, 'playback_resolution_event_write_failed');
  }
}
