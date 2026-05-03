import { lt, sql } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { logger } from "@/app-layer/logging/logger";
import { mediaPlaybackStatsHourly } from "../../../db/schema";

/** Oldest hourly buckets retained; older rows may be purged (KPI использует только скользящее окно). */
export const PLAYBACK_HOURLY_STATS_RETENTION_DAYS = 90;

export type PlaybackHourlyPurgeResult = {
  /** Rows matched for delete (dry run) или фактически удалённые `.returning` строки. */
  deleted: number;
  retentionDays: number;
  dryRun: boolean;
};

/**
 * Purges stale rows from `media_playback_stats_hourly`. Dedup таблицы `media_playback_user_video_first_resolve` не трогает —
 * там хранится «видел ли когда-либо», без TTL.
 */
export async function purgeStalePlaybackHourlyStats(options?: {
  retentionDays?: number;
  dryRun?: boolean;
  throwErrors?: boolean;
}): Promise<PlaybackHourlyPurgeResult> {
  const days = Math.max(1, Math.floor(options?.retentionDays ?? PLAYBACK_HOURLY_STATS_RETENTION_DAYS));
  const cutoffExpr = sql`(now() - (${days}::integer * interval '1 day'))`;
  try {
    const db = getDrizzle();
    if (options?.dryRun) {
      const row = await db
        .select({ c: sql<string>`COUNT(*)::text`.as("cnt") })
        .from(mediaPlaybackStatsHourly)
        .where(lt(mediaPlaybackStatsHourly.bucketHour, cutoffExpr));
      const n = Number.parseInt(row[0]?.c ?? "0", 10) || 0;
      return { deleted: n, retentionDays: days, dryRun: true };
    }

    const removed = await db
      .delete(mediaPlaybackStatsHourly)
      .where(lt(mediaPlaybackStatsHourly.bucketHour, cutoffExpr))
      .returning({ bucketHour: mediaPlaybackStatsHourly.bucketHour });

    return { deleted: removed.length, retentionDays: days, dryRun: false };
  } catch (e) {
    logger.error({ err: e, days }, "playback_hourly_stats_purge_failed");
    if (options?.throwErrors) throw e;
    return { deleted: 0, retentionDays: days, dryRun: Boolean(options?.dryRun) };
  }
}
