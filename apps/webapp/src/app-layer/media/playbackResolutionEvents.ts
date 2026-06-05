import { getDrizzle } from "@/app-layer/db/drizzle";
import { logger } from "@/app-layer/logging/logger";
import type { PlaybackStatDelivery } from "@/app-layer/media/playbackStatsHourly";
import { mediaPlaybackResolutionEvents } from "../../../db/schema";

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
    const db = getDrizzle();
    await db.insert(mediaPlaybackResolutionEvents).values({
      userId: input.userId,
      mediaId: input.mediaId,
      delivery: input.delivery,
      fallbackUsed: input.fallbackUsed,
    });
  } catch (e) {
    logger.error({ err: e, mediaId: input.mediaId }, "playback_resolution_event_write_failed");
  }
}
