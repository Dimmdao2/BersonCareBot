import { logger } from "@/app-layer/logging/logger";
import { runWebappPgText } from "@/infra/db/runWebappSql";
import type { PlaybackStatDelivery } from "@/app-layer/media/playbackStatsHourly";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Per-user playback resolve event for doctor analytics (best-effort; never throws). */
export async function recordPlaybackResolutionEvent(input: {
  userId: string;
  mediaId: string;
  delivery: PlaybackStatDelivery;
  fallbackUsed: boolean;
}): Promise<void> {
  if (!UUID.test(input.userId) || !UUID.test(input.mediaId)) return;

  try {
    await runWebappPgText(
      "SELECT app.record_media_playback_resolution_event($1::uuid, $2::uuid, $3, $4)",
      [input.userId, input.mediaId, input.delivery, input.fallbackUsed],
    );
  } catch (e) {
    logger.error({ err: e, mediaId: input.mediaId }, "playback_resolution_event_write_failed");
  }
}
