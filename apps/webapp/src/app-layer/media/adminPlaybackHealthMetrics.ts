import { gte, sql } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { logger } from "@/app-layer/logging/logger";
import { mediaPlaybackStatsHourly, mediaPlaybackUserVideoFirstResolve } from "../../../db/schema";

export const ADMIN_PLAYBACK_METRICS_WINDOW_HOURS = 24;

export type AdminPlaybackHealthMetrics = {
  byDelivery: { hls: number; mp4: number; file: number };
  fallbackTotal: number;
  totalResolutions: number;
  /**
   * Число новых строк в `media_playback_user_video_first_resolve`, у которых `first_resolved_at` попадает в окно.
   * Семантика: «сколько впервые за всё время уникальных пар (пользователь+видео) впервые зарегистрировали просмотр в этом окне».
   */
  uniquePlaybackPairsFirstSeenInWindow: number;
};

/** Aggregates playback health metrics for `/api/admin/system-health` using Drizzle. */
export async function loadAdminPlaybackHealthMetrics(opts: {
  windowHours?: number;
}): Promise<AdminPlaybackHealthMetrics> {
  const windowHours =
    typeof opts.windowHours === "number" && Number.isFinite(opts.windowHours) && opts.windowHours > 0
      ? Math.floor(opts.windowHours)
      : ADMIN_PLAYBACK_METRICS_WINDOW_HOURS;

  const windowCutoffSql = sql`(now() - (${windowHours}::integer * interval '1 hour'))`;

  try {
    const db = getDrizzle();

    const [totalsRows, uniqueRow] = await Promise.all([
      db
        .select({
          delivery: mediaPlaybackStatsHourly.delivery,
          resolvedSum: sql<string>`COALESCE(SUM(${mediaPlaybackStatsHourly.resolvedCount}), 0)::text`,
          fallbackSum: sql<string>`COALESCE(SUM(${mediaPlaybackStatsHourly.fallbackCount}), 0)::text`,
        })
        .from(mediaPlaybackStatsHourly)
        .where(gte(mediaPlaybackStatsHourly.bucketHour, windowCutoffSql))
        .groupBy(mediaPlaybackStatsHourly.delivery),
      db
        .select({ c: sql<string>`COUNT(*)::text`.as("cnt") })
        .from(mediaPlaybackUserVideoFirstResolve)
        .where(gte(mediaPlaybackUserVideoFirstResolve.firstResolvedAt, windowCutoffSql)),
    ]);

    const byDelivery = { hls: 0, mp4: 0, file: 0 };
    let fallbackTotal = 0;
    let totalResolutions = 0;
    for (const row of totalsRows) {
      const r = Number.parseInt(row.resolvedSum, 10) || 0;
      const f = Number.parseInt(row.fallbackSum, 10) || 0;
      totalResolutions += r;
      fallbackTotal += f;
      if (row.delivery === "hls") byDelivery.hls = r;
      else if (row.delivery === "mp4") byDelivery.mp4 = r;
      else if (row.delivery === "file") byDelivery.file = r;
    }

    const uniquePlaybackPairsFirstSeenInWindow =
      Number.parseInt(uniqueRow[0]?.c ?? "0", 10) || 0;

    return {
      byDelivery,
      fallbackTotal,
      totalResolutions,
      uniquePlaybackPairsFirstSeenInWindow,
    };
  } catch (e) {
    logger.error({ err: e }, "admin_playback_health_metrics_failed");
    throw e;
  }
}
