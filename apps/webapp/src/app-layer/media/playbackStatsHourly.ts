import { sql } from 'drizzle-orm';
import { logger } from '@/app-layer/logging/logger';
import { getWebappSqlDb, runWebappSql } from '@/infra/db/runWebappSql';

export type PlaybackStatDelivery = 'hls' | 'mp4' | 'file';

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
  userId: string;
  mediaId: string;
  delivery: PlaybackStatDelivery;
  fallbackUsed: boolean;
}): Promise<void> {
  try {
    await runWebappSql(
      getWebappSqlDb(),
      sql`SELECT app.increment_media_playback_resolution_stat(${input.userId}::uuid, ${input.mediaId}::uuid, ${input.delivery}, ${input.fallbackUsed})`,
    );
  } catch (e) {
    logger.error({ err: e, delivery: input.delivery }, 'playback_stats_hourly_write_failed');
  }
}
