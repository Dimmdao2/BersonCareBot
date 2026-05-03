import { getDrizzle } from "@/app-layer/db/drizzle";
import { logger } from "@/app-layer/logging/logger";
import { mediaPlaybackUserVideoFirstResolve } from "../../../db/schema";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** True if this `(user,video)` pair was inserted for the first time (lifetime unique marker). */
export async function recordPlaybackUserVideoFirstResolve(input: {
  userId: string;
  mediaId: string;
}): Promise<boolean> {
  if (!UUID.test(input.userId) || !UUID.test(input.mediaId)) return false;

  try {
    const db = getDrizzle();
    const rows = await db
      .insert(mediaPlaybackUserVideoFirstResolve)
      .values({
        userId: input.userId,
        mediaId: input.mediaId,
      })
      .onConflictDoNothing({
        target: [mediaPlaybackUserVideoFirstResolve.userId, mediaPlaybackUserVideoFirstResolve.mediaId],
      })
      .returning({ mediaId: mediaPlaybackUserVideoFirstResolve.mediaId });

    return rows.length > 0;
  } catch (e) {
    logger.error({ err: e, mediaId: input.mediaId }, "playback_user_video_first_resolve_write_failed");
    return false;
  }
}
