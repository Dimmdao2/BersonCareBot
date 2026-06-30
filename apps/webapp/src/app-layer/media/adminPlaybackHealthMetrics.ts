import { and, gte, sql } from "drizzle-orm";
import { drizzleExcludeUserIdColumn } from "@/modules/analytics/analyticsAudience";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { logger } from "@/app-layer/logging/logger";
import {
  mediaPlaybackResolutionEvents,
  mediaPlaybackStatsHourly,
  mediaPlaybackUserVideoFirstResolve,
} from "../../../db/schema";

export const ADMIN_PLAYBACK_METRICS_WINDOW_HOURS = 24;
/** Client-side video errors in last 1 h that trigger "degraded" (mirrors transcode threshold). */
export const ADMIN_PLAYBACK_CLIENT_ERRORS_1H_DEGRADED = 3;

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
  excludedUserIds?: string[];
}): Promise<AdminPlaybackHealthMetrics> {
  const windowHours =
    typeof opts.windowHours === "number" && Number.isFinite(opts.windowHours) && opts.windowHours > 0
      ? Math.floor(opts.windowHours)
      : ADMIN_PLAYBACK_METRICS_WINDOW_HOURS;

  const windowCutoffSql = sql`(now() - (${windowHours}::integer * interval '1 hour'))`;
  const excludedUserIds = opts.excludedUserIds ?? [];
  const audienceFiltered = excludedUserIds.length > 0;
  const uniqueUserExclude = drizzleExcludeUserIdColumn(
    mediaPlaybackUserVideoFirstResolve.userId,
    excludedUserIds,
  );
  const resolutionUserExclude = drizzleExcludeUserIdColumn(
    mediaPlaybackResolutionEvents.userId,
    excludedUserIds,
  );

  try {
    const db = getDrizzle();

    const hourlyTotalsQuery = () =>
      db
        .select({
          delivery: mediaPlaybackStatsHourly.delivery,
          resolvedSum: sql<string>`COALESCE(SUM(${mediaPlaybackStatsHourly.resolvedCount}), 0)::text`,
          fallbackSum: sql<string>`COALESCE(SUM(${mediaPlaybackStatsHourly.fallbackCount}), 0)::text`,
        })
        .from(mediaPlaybackStatsHourly)
        .where(gte(mediaPlaybackStatsHourly.bucketHour, windowCutoffSql))
        .groupBy(mediaPlaybackStatsHourly.delivery);

    const audienceTotalsQuery = () =>
      db
        .select({
          delivery: mediaPlaybackResolutionEvents.delivery,
          resolvedSum: sql<string>`COUNT(*)::text`,
          fallbackSum: sql<string>`COALESCE(SUM(CASE WHEN ${mediaPlaybackResolutionEvents.fallbackUsed} THEN 1 ELSE 0 END), 0)::text`,
        })
        .from(mediaPlaybackResolutionEvents)
        .where(
          and(gte(mediaPlaybackResolutionEvents.resolvedAt, windowCutoffSql), resolutionUserExclude),
        )
        .groupBy(mediaPlaybackResolutionEvents.delivery);

    let totalsRows: Array<{
      delivery: string;
      resolvedSum: string;
      fallbackSum: string;
    }>;
    if (audienceFiltered) {
      // Per-user resolution events only — hourly rollups cannot exclude test accounts.
      totalsRows = await audienceTotalsQuery();
    } else {
      try {
        totalsRows = await audienceTotalsQuery();
        let audienceTotal = 0;
        for (const row of totalsRows) {
          audienceTotal += Number.parseInt(row.resolvedSum, 10) || 0;
        }
        if (audienceTotal === 0) {
          totalsRows = await hourlyTotalsQuery();
        }
      } catch (eventsErr) {
        const code =
          eventsErr && typeof eventsErr === "object" && "code" in eventsErr
            ? String((eventsErr as { code?: string }).code)
            : "";
        if (code !== "42P01") throw eventsErr;
        logger.warn({ err: eventsErr }, "playback_resolution_events_missing_fallback_hourly");
        totalsRows = await hourlyTotalsQuery();
      }
    }

    const uniqueRow = await db
      .select({ c: sql<string>`COUNT(*)::text`.as("cnt") })
      .from(mediaPlaybackUserVideoFirstResolve)
      .where(and(gte(mediaPlaybackUserVideoFirstResolve.firstResolvedAt, windowCutoffSql), uniqueUserExclude));

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
