import { sql } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { logger } from "@/app-layer/logging/logger";
import { mediaPlaybackStatsHourly } from "../../../db/schema";

export type PlaybackStatDelivery = "hls" | "mp4" | "file";

/** Current UTC hour floored; ISO string for `timestamptz` column. */
export function utcHourBucketIso(now: Date = new Date()): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), 0, 0, 0),
  ).toISOString();
}

/**
 * Increment hourly aggregates for admin system-health (best-effort; never throws to callers).
 * VIDEO_HLS_DELIVERY: one row per (bucket_hour UTC, delivery).
 */
export async function recordPlaybackResolutionStat(input: {
  delivery: PlaybackStatDelivery;
  fallbackUsed: boolean;
}): Promise<void> {
  try {
    const db = getDrizzle();
    const bucketHour = utcHourBucketIso();
    const fallbackDelta = input.fallbackUsed ? 1 : 0;
    await db
      .insert(mediaPlaybackStatsHourly)
      .values({
        bucketHour,
        delivery: input.delivery,
        resolvedCount: 1,
        fallbackCount: fallbackDelta,
      })
      .onConflictDoUpdate({
        target: [mediaPlaybackStatsHourly.bucketHour, mediaPlaybackStatsHourly.delivery],
        set: {
          resolvedCount: sql`${mediaPlaybackStatsHourly.resolvedCount} + 1`,
          fallbackCount: sql`${mediaPlaybackStatsHourly.fallbackCount} + ${fallbackDelta}`,
        },
      });
  } catch (e) {
    logger.error({ err: e, delivery: input.delivery }, "playback_stats_hourly_write_failed");
  }
}
