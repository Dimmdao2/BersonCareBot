import { lt, sql } from 'drizzle-orm';
import { getDrizzle } from '@/app-layer/db/drizzle';
import { logger } from '@/app-layer/logging/logger';
import {
  mediaPlaybackClientEvents,
  mediaPlaybackResolutionEvents,
  mediaPlaybackStatsHourly,
} from '../../../db/schema';

/** Oldest hourly buckets retained; older rows may be purged (KPI использует только скользящее окно). */
export const PLAYBACK_HOURLY_STATS_RETENTION_DAYS = 90;

/** Raw diagnostic events remain available for annual comparisons and incident investigation. */
export const PLAYBACK_RAW_EVENTS_RETENTION_DAYS = 400;

/**
 * The sweep branches this job REALLY implements — the module half of a prune-root name, the way
 * `RETENTION_SWEEP_TARGETS` is the DB-root half.
 *
 * Exhaustive lifecycle census audit 2026-08-28, F4: the lifecycle gate accepted any prune target
 * containing a dot or a colon, so `media_playback_stats.retention:events` and
 * `…:client_events` passed as decided 30-day windows while nothing in this repository ever deletes
 * a row of `media_playback_resolution_events` or `media_playback_client_events`. A branch that is
 * not listed here is not a prune root, and the gate now says so.
 */
export const MEDIA_PLAYBACK_STATS_RETENTION_BRANCHES = [
  'hourly',
  'events',
  'client_events',
] as const;

export type PlaybackHourlyPurgeResult = {
  /** Total rows matched for delete (dry run) or actually removed. */
  deleted: number;
  deletedByStore: {
    hourly: number;
    resolutionEvents: number;
    clientEvents: number;
  };
  retentionDays: number;
  rawEventRetentionDays: number;
  dryRun: boolean;
};

/**
 * Purges the three bounded playback telemetry stores in one transaction. The dedup table
 * `media_playback_user_video_first_resolve` is deliberately untouched: it records whether a person
 * ever watched the video and has no TTL.
 */
export async function purgeStalePlaybackHourlyStats(options?: {
  retentionDays?: number;
  rawEventRetentionDays?: number;
  dryRun?: boolean;
  throwErrors?: boolean;
}): Promise<PlaybackHourlyPurgeResult> {
  const days = Math.max(
    1,
    Math.floor(options?.retentionDays ?? PLAYBACK_HOURLY_STATS_RETENTION_DAYS),
  );
  const rawEventDays = Math.max(
    1,
    Math.floor(options?.rawEventRetentionDays ?? PLAYBACK_RAW_EVENTS_RETENTION_DAYS),
  );
  const hourlyCutoffExpr = sql`(now() - (${days}::integer * interval '1 day'))`;
  const rawEventCutoffExpr = sql`(now() - (${rawEventDays}::integer * interval '1 day'))`;
  try {
    const db = getDrizzle();
    const deletedByStore = await db.transaction(async (tx) => {
      if (options?.dryRun) {
        const [hourly, resolutionEvents, clientEvents] = await Promise.all([
          tx
            .select({ c: sql<string>`COUNT(*)::text`.as('cnt') })
            .from(mediaPlaybackStatsHourly)
            .where(lt(mediaPlaybackStatsHourly.bucketHour, hourlyCutoffExpr)),
          tx
            .select({ c: sql<string>`COUNT(*)::text`.as('cnt') })
            .from(mediaPlaybackResolutionEvents)
            .where(lt(mediaPlaybackResolutionEvents.resolvedAt, rawEventCutoffExpr)),
          tx
            .select({ c: sql<string>`COUNT(*)::text`.as('cnt') })
            .from(mediaPlaybackClientEvents)
            .where(lt(mediaPlaybackClientEvents.createdAt, rawEventCutoffExpr)),
        ]);
        return {
          hourly: Number.parseInt(hourly[0]?.c ?? '0', 10) || 0,
          resolutionEvents: Number.parseInt(resolutionEvents[0]?.c ?? '0', 10) || 0,
          clientEvents: Number.parseInt(clientEvents[0]?.c ?? '0', 10) || 0,
        };
      }

      const hourly = await tx
        .delete(mediaPlaybackStatsHourly)
        .where(lt(mediaPlaybackStatsHourly.bucketHour, hourlyCutoffExpr))
        .returning({ bucketHour: mediaPlaybackStatsHourly.bucketHour });
      const resolutionEvents = await tx
        .delete(mediaPlaybackResolutionEvents)
        .where(lt(mediaPlaybackResolutionEvents.resolvedAt, rawEventCutoffExpr))
        .returning({ id: mediaPlaybackResolutionEvents.id });
      const clientEvents = await tx
        .delete(mediaPlaybackClientEvents)
        .where(lt(mediaPlaybackClientEvents.createdAt, rawEventCutoffExpr))
        .returning({ id: mediaPlaybackClientEvents.id });
      return {
        hourly: hourly.length,
        resolutionEvents: resolutionEvents.length,
        clientEvents: clientEvents.length,
      };
    });
    return {
      deleted: deletedByStore.hourly
        + deletedByStore.resolutionEvents
        + deletedByStore.clientEvents,
      deletedByStore,
      retentionDays: days,
      rawEventRetentionDays: rawEventDays,
      dryRun: Boolean(options?.dryRun),
    };
  } catch (e) {
    logger.error({ err: e, days, rawEventDays }, 'playback_stats_retention_failed');
    if (options?.throwErrors) throw e;
    return {
      deleted: 0,
      deletedByStore: { hourly: 0, resolutionEvents: 0, clientEvents: 0 },
      retentionDays: days,
      rawEventRetentionDays: rawEventDays,
      dryRun: Boolean(options?.dryRun),
    };
  }
}
