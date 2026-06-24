import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { drizzleExcludeUserIdColumn, drizzleSqlUuidInList } from "@/modules/analytics/analyticsAudience";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { loadAdminPlaybackHealthMetrics, type AdminPlaybackHealthMetrics } from "@/app-layer/media/adminPlaybackHealthMetrics";
import {
  loadAdminPlaybackClientHealthMetrics,
  type AdminPlaybackClientHealthMetrics,
} from "@/app-layer/media/playbackClientEvents";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";
import { buildReminderSendsLast24hClock, type HourlyClockSlice } from "@/app-layer/stats/reminderHourlyClock";
import { patientDailyWarmupVideoViews } from "../../../db/schema/patientDailyWarmupVideoView";
import { patientPracticeCompletions } from "../../../db/schema/patientPractice";
import {
  productAnalyticsEventsRecent,
  productPushNotifications,
} from "../../../db/schema/productAnalytics";
import {
  contentPages,
  mediaFiles,
  mediaPlaybackResolutionEvents,
  reminderOccurrenceHistory,
  reminderRules,
} from "../../../db/schema/schema";
import {
  loadReminderPeopleWithNotificationsStats,
  type ReminderPeopleWithNotificationsStats,
} from "@/app-layer/stats/reminderNotificationPeopleStats";
import { estimateWatchMinutes } from "@/app-layer/stats/estimateWatchMinutes";

export type ContentEngagementTopPageRow = {
  contentPageId: string;
  section: string;
  slug: string;
  count: number;
};

export type ExerciseVideoTopItemRow = {
  mediaId: string;
  title: string;
  count: number;
};

const EXERCISE_VIDEO_TOP_LIMIT = 15;

/**
 * AN-11: split exercise-video opens into the promo slice (general content
 * activity — every patient has the promo program) and the assigned slice
 * (doctor/course programs — client-specific). Rows arrive ordered by count desc;
 * each media is pre-bucketed (in_promo) so there is no double counting.
 */
export function buildExerciseVideoSplit(
  rows: ReadonlyArray<{ media_id: string; title: string; in_promo: boolean; n: string }>,
): {
  promoExerciseVideoTopItems: ExerciseVideoTopItemRow[];
  promoExerciseVideoCount: number;
  assignedExerciseVideoTopItems: ExerciseVideoTopItemRow[];
  assignedExerciseVideoCount: number;
} {
  const toItem = (r: { media_id: string; title: string; n: string }): ExerciseVideoTopItemRow => ({
    mediaId: r.media_id ?? "",
    title: r.title ?? "",
    count: Number(r.n ?? 0),
  });
  const promo = rows.filter((r) => r.in_promo).map(toItem);
  const assigned = rows.filter((r) => !r.in_promo).map(toItem);
  const sum = (items: ExerciseVideoTopItemRow[]) => items.reduce((acc, r) => acc + r.count, 0);
  return {
    promoExerciseVideoTopItems: promo.slice(0, EXERCISE_VIDEO_TOP_LIMIT),
    promoExerciseVideoCount: sum(promo),
    assignedExerciseVideoTopItems: assigned.slice(0, EXERCISE_VIDEO_TOP_LIMIT),
    assignedExerciseVideoCount: sum(assigned),
  };
}

const DEFAULT_WINDOW_HOURS = 168;
const MIN_WINDOW_HOURS = 1;
const MAX_WINDOW_HOURS = 720;

export type OccurrenceHourlyBucket = {
  bucket: string;
  sent: number;
  failed: number;
};

/** Сутки в `app_display_timezone`. */
export type OccurrenceDailyBucket = OccurrenceHourlyBucket;

/** Час / сутки в `app_display_timezone` (`push_open` — events_recent; `push_sent` — product_push_notifications). */
export type PushOpenBucket = {
  bucket: string;
  opened: number;
  sent: number;
};

export type PushOpensSummary = {
  opened: number;
  sent: number;
  /** 0…1; 0 если sent = 0 */
  openRate: number;
};

export type ContentEngagementStatsResponse = {
  windowHours: number;
  /** IANA из `system_settings.app_display_timezone` — все бакеты и подписи графиков. */
  displayTimezone: string;
  /** Люди с ≥1 включённым напоминанием и каналы доставки (см. `loadReminderPeopleWithNotificationsStats`). */
  peopleWithNotifications: ReminderPeopleWithNotificationsStats;
  /** Распределение отправок по часам 0–23 за последние 24 ч в `displayTimezone`. */
  reminderSendsLast24hClock: HourlyClockSlice[];
  occurrenceHistoryHourly: OccurrenceHourlyBucket[];
  occurrenceHistoryDaily: OccurrenceDailyBucket[];
  pushOpensSummary: PushOpensSummary;
  pushOpensHourly: PushOpenBucket[];
  pushOpensDaily: PushOpenBucket[];
  practiceBySource: Record<string, number>;
  practiceTopPages: ContentEngagementTopPageRow[];
  /** Открытия видео разминки дня (`patient_daily_warmup_video_views`), не завершения практики. */
  warmupVideoTopPages: ContentEngagementTopPageRow[];
  /** Оценка минут просмотра разминок: сумма `video_duration_seconds` каталожного видео по открытиям. */
  warmupVideoEstimatedWatchMinutes: number;
  /** Оценка минут просмотра всех видео: сумма длительностей по `media_playback_resolution_events`. */
  videoPlaybackEstimatedWatchMinutes: number;
  /** AN-11: открытия видео упражнений ПРОМО-программы (общая контент-активность) — топ. */
  promoExerciseVideoTopItems: ExerciseVideoTopItemRow[];
  /** Суммарные открытия видео упражнений промо-программы за период. */
  promoExerciseVideoCount: number;
  /** AN-11: открытия видео упражнений из назначенных программ (врач/курс) — топ. */
  assignedExerciseVideoTopItems: ExerciseVideoTopItemRow[];
  /** Суммарные открытия видео упражнений назначенных программ за период. */
  assignedExerciseVideoCount: number;
  /** Same rolling window as other blocks; reuses `loadAdminPlaybackHealthMetrics`. */
  videoPlayback: AdminPlaybackHealthMetrics;
  /** Ошибки воспроизведения в браузере; тот же helper, что `GET /api/admin/system-health` → `videoPlaybackClient`. */
  videoPlaybackClient: AdminPlaybackClientHealthMetrics;
  /**
   * @deprecated Число строк `reminder_rules` с `is_enabled=true` (не люди). Используйте `peopleWithNotifications.currentPeopleCount`.
   */
  reminderRulesEnabledCount: number;
};

/** @deprecated Prefer {@link ContentEngagementStatsResponse}. */
export type AdminReminderStatsResponse = ContentEngagementStatsResponse;

function clampWindowHours(raw: unknown): number {
  const n = typeof raw === "number" && Number.isFinite(raw) ? Math.floor(raw) : DEFAULT_WINDOW_HOURS;
  return Math.min(MAX_WINDOW_HOURS, Math.max(MIN_WINDOW_HOURS, n || DEFAULT_WINDOW_HOURS));
}

/** Safe entrypoint for `GET /api/admin/reminder-stats` and `GET /api/doctor/content-stats` query parsing. */
export function parseReminderStatsWindowHours(param: string | null): number {
  if (param == null || param.trim() === "") return DEFAULT_WINDOW_HOURS;
  const parsed = Number.parseInt(param.trim(), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_WINDOW_HOURS;
  return clampWindowHours(parsed);
}

function mergeOccurrenceHourly(
  rows: Array<{ bucket: string; status: string; n: unknown }>,
): OccurrenceHourlyBucket[] {
  const map = new Map<string, { sent: number; failed: number }>();
  for (const r of rows) {
    const key = r.bucket;
    if (!map.has(key)) map.set(key, { sent: 0, failed: 0 });
    const m = map.get(key)!;
    const n = Number(r.n ?? 0);
    if (r.status === "sent") m.sent += n;
    else if (r.status === "failed") m.failed += n;
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucket, v]) => ({ bucket, sent: v.sent, failed: v.failed }));
}

/** @visibleForTesting — merge hourly/daily push_open + push_sent rows into one bucket series. */
export function mergePushOpenBuckets(
  rows: Array<{ bucket: string; eventType: string; n: unknown }>,
): PushOpenBucket[] {
  const map = new Map<string, { opened: number; sent: number }>();
  for (const r of rows) {
    if (!map.has(r.bucket)) map.set(r.bucket, { opened: 0, sent: 0 });
    const m = map.get(r.bucket)!;
    const n = Number(r.n ?? 0);
    if (r.eventType === "push_open") m.opened += n;
    else if (r.eventType === "push_sent") m.sent += n;
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucket, v]) => ({ bucket, opened: v.opened, sent: v.sent }));
}

/** @visibleForTesting — aggregate opened/sent/openRate across buckets. */
export function summarizePushOpens(buckets: PushOpenBucket[]): PushOpensSummary {
  let opened = 0;
  let sent = 0;
  for (const b of buckets) {
    opened += b.opened;
    sent += b.sent;
  }
  return {
    opened,
    sent,
    openRate: sent > 0 ? opened / sent : 0,
  };
}

/**
 * Платформенные агрегаты: напоминания, практика по страницам, метрики выдачи видео (без списков PII).
 * Используется и админкой (`/api/admin/reminder-stats`), и кабинетом врача (`/api/doctor/content-stats`).
 */
function reminderOccurrenceAudienceSql(excludedUserIds: string[]) {
  if (excludedUserIds.length === 0) return undefined;
  return sql`EXISTS (
    SELECT 1
    FROM reminder_rules rr
    LEFT JOIN platform_users pu
      ON pu.integrator_user_id = rr.integrator_user_id
     AND rr.platform_user_id IS NULL
    WHERE rr.integrator_rule_id = ${reminderOccurrenceHistory.integratorRuleId}
      AND COALESCE(rr.platform_user_id, pu.id) IS NOT NULL
      AND COALESCE(rr.platform_user_id, pu.id) NOT IN (${drizzleSqlUuidInList(excludedUserIds)})
  )`;
}

export async function loadContentEngagementStats(opts: {
  windowHours?: number;
  excludedUserIds?: string[];
}): Promise<ContentEngagementStatsResponse> {
  const windowHours = clampWindowHours(opts.windowHours);
  const excludedUserIds = opts.excludedUserIds ?? [];
  const displayTimezone = await getAppDisplayTimeZone();
  const displayTimezoneSql = sql`${displayTimezone}::text`;
  const windowCutoffSql = sql`(now() - (${windowHours}::integer * interval '1 hour'))`;
  const db = getDrizzle();

  const hourTruncOcc = sql`date_trunc('hour', timezone(${displayTimezoneSql}, ${reminderOccurrenceHistory.occurredAt}))`;
  const dayTruncOcc = sql`date_trunc('day', timezone(${displayTimezoneSql}, ${reminderOccurrenceHistory.occurredAt}))`;
  const hourTruncPushOpen = sql`date_trunc('hour', timezone(${displayTimezoneSql}, ${productAnalyticsEventsRecent.occurredAt}))`;
  const dayTruncPushOpen = sql`date_trunc('day', timezone(${displayTimezoneSql}, ${productAnalyticsEventsRecent.occurredAt}))`;
  const hourTruncPushSent = sql`date_trunc('hour', timezone(${displayTimezoneSql}, ${productPushNotifications.createdAt}))`;
  const dayTruncPushSent = sql`date_trunc('day', timezone(${displayTimezoneSql}, ${productPushNotifications.createdAt}))`;
  const occurrenceAudience = reminderOccurrenceAudienceSql(excludedUserIds);
  const practiceUserExclude = drizzleExcludeUserIdColumn(
    patientPracticeCompletions.userId,
    excludedUserIds,
  );
  const warmupUserExclude = drizzleExcludeUserIdColumn(patientDailyWarmupVideoViews.userId, excludedUserIds);
  const pushOpenUserExclude = drizzleExcludeUserIdColumn(productAnalyticsEventsRecent.userId, excludedUserIds);
  const pushSentUserExclude = drizzleExcludeUserIdColumn(productPushNotifications.userId, excludedUserIds);
  const resolutionUserExclude = drizzleExcludeUserIdColumn(mediaPlaybackResolutionEvents.userId, excludedUserIds);
  const exerciseUserExcludeSql =
    excludedUserIds.length > 0
      ? sql`AND mpre.user_id NOT IN (${drizzleSqlUuidInList(excludedUserIds)})`
      : sql``;
  const trimmedContentVideoUrl = sql`trim(split_part(split_part(${contentPages.videoUrl}, '#', 1), '?', 1))`;
  const apiMediaIdFromContentVideoUrl = sql`(
    substring(
      ${trimmedContentVideoUrl}
      from '/api/media/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})'
    )
  )::uuid`;

  const [
    occRows,
    occDailyRows,
    occClockRows,
    pushOpenHourlyRows,
    pushOpenDailyRows,
    pushSentHourlyRows,
    pushSentDailyRows,
    practiceSourceRows,
    practicePageRows,
    warmupVideoPageRows,
    warmupWatchMinutesRow,
    warmupViewsCountRow,
    videoWatchMinutesRow,
    videoResolutionCountRow,
    avgVideoDurationRow,
    peopleWithNotifications,
    reminderRulesEnabledRow,
    videoPlayback,
    videoPlaybackClient,
    exerciseVideoRows,
  ] = await Promise.all([
    db
      .select({
        bucket: sql<string>`${hourTruncOcc}::text`.as("bucket"),
        status: reminderOccurrenceHistory.status,
        n: count(),
      })
      .from(reminderOccurrenceHistory)
      .where(and(gte(reminderOccurrenceHistory.occurredAt, windowCutoffSql), occurrenceAudience))
      // GROUP BY select positions: Drizzle duplicates timezone() params and PG rejects mismatched GROUP BY.
      .groupBy(sql`1`, sql`2`)
      .orderBy(sql`1`),
    db
      .select({
        bucket: sql<string>`${dayTruncOcc}::text`.as("bucket"),
        status: reminderOccurrenceHistory.status,
        n: count(),
      })
      .from(reminderOccurrenceHistory)
      .where(and(gte(reminderOccurrenceHistory.occurredAt, windowCutoffSql), occurrenceAudience))
      .groupBy(sql`1`, sql`2`)
      .orderBy(sql`1`),
    db
      .select({
        bucket: sql<string>`${hourTruncOcc}::text`.as("bucket"),
        status: reminderOccurrenceHistory.status,
        n: count(),
      })
      .from(reminderOccurrenceHistory)
      .where(
        and(
          gte(reminderOccurrenceHistory.occurredAt, sql`now() - interval '24 hours'`),
          occurrenceAudience,
        ),
      )
      .groupBy(sql`1`, sql`2`)
      .orderBy(sql`1`),
    db
      .select({
        bucket: sql<string>`${hourTruncPushOpen}::text`.as("bucket"),
        n: count(),
      })
      .from(productAnalyticsEventsRecent)
      .where(
        and(
          gte(productAnalyticsEventsRecent.occurredAt, windowCutoffSql),
          eq(productAnalyticsEventsRecent.eventType, "push_open"),
          pushOpenUserExclude,
        ),
      )
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    db
      .select({
        bucket: sql<string>`${dayTruncPushOpen}::text`.as("bucket"),
        n: count(),
      })
      .from(productAnalyticsEventsRecent)
      .where(
        and(
          gte(productAnalyticsEventsRecent.occurredAt, windowCutoffSql),
          eq(productAnalyticsEventsRecent.eventType, "push_open"),
          pushOpenUserExclude,
        ),
      )
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    db
      .select({
        bucket: sql<string>`${hourTruncPushSent}::text`.as("bucket"),
        n: count(),
      })
      .from(productPushNotifications)
      .where(and(gte(productPushNotifications.createdAt, windowCutoffSql), pushSentUserExclude))
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    db
      .select({
        bucket: sql<string>`${dayTruncPushSent}::text`.as("bucket"),
        n: count(),
      })
      .from(productPushNotifications)
      .where(and(gte(productPushNotifications.createdAt, windowCutoffSql), pushSentUserExclude))
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    db
      .select({
        source: patientPracticeCompletions.source,
        n: count(),
      })
      .from(patientPracticeCompletions)
      .where(and(gte(patientPracticeCompletions.completedAt, windowCutoffSql), practiceUserExclude))
      .groupBy(patientPracticeCompletions.source),
    db
      .select({
        contentPageId: patientPracticeCompletions.contentPageId,
        section: contentPages.section,
        slug: contentPages.slug,
        n: count(),
      })
      .from(patientPracticeCompletions)
      .innerJoin(contentPages, eq(patientPracticeCompletions.contentPageId, contentPages.id))
      .where(and(gte(patientPracticeCompletions.completedAt, windowCutoffSql), practiceUserExclude))
      .groupBy(patientPracticeCompletions.contentPageId, contentPages.section, contentPages.slug)
      .orderBy(desc(count()))
      .limit(15),
    db
      .select({
        contentPageId: patientDailyWarmupVideoViews.contentPageId,
        section: contentPages.section,
        slug: contentPages.slug,
        n: count(),
      })
      .from(patientDailyWarmupVideoViews)
      .innerJoin(contentPages, eq(patientDailyWarmupVideoViews.contentPageId, contentPages.id))
      .where(and(gte(patientDailyWarmupVideoViews.viewedAt, windowCutoffSql), warmupUserExclude))
      .groupBy(patientDailyWarmupVideoViews.contentPageId, contentPages.section, contentPages.slug)
      .orderBy(desc(count()))
      .limit(15),
    db
      .select({
        totalSeconds: sql<number>`COALESCE(SUM(COALESCE(${mediaFiles.videoDurationSeconds}, 0)), 0)::int`.as(
          "total_seconds",
        ),
      })
      .from(patientDailyWarmupVideoViews)
      .innerJoin(contentPages, eq(patientDailyWarmupVideoViews.contentPageId, contentPages.id))
      .leftJoin(mediaFiles, eq(mediaFiles.id, apiMediaIdFromContentVideoUrl))
      .where(and(gte(patientDailyWarmupVideoViews.viewedAt, windowCutoffSql), warmupUserExclude)),
    db
      .select({ n: count() })
      .from(patientDailyWarmupVideoViews)
      .where(and(gte(patientDailyWarmupVideoViews.viewedAt, windowCutoffSql), warmupUserExclude)),
    db
      .select({
        totalSeconds: sql<number>`COALESCE(SUM(COALESCE(${mediaFiles.videoDurationSeconds}, 0)), 0)::int`.as(
          "total_seconds",
        ),
      })
      .from(mediaPlaybackResolutionEvents)
      .innerJoin(mediaFiles, eq(mediaPlaybackResolutionEvents.mediaId, mediaFiles.id))
      .where(and(gte(mediaPlaybackResolutionEvents.resolvedAt, windowCutoffSql), resolutionUserExclude)),
    db
      .select({ n: count() })
      .from(mediaPlaybackResolutionEvents)
      .where(and(gte(mediaPlaybackResolutionEvents.resolvedAt, windowCutoffSql), resolutionUserExclude)),
    db
      .select({
        avgSeconds: sql<number>`COALESCE(AVG(NULLIF(${mediaFiles.videoDurationSeconds}, 0)), 0)::float`.as(
          "avg_seconds",
        ),
      })
      .from(mediaFiles)
      .where(sql`${mediaFiles.videoDurationSeconds} IS NOT NULL AND ${mediaFiles.videoDurationSeconds} > 0`),
    loadReminderPeopleWithNotificationsStats({ windowHours, displayTimezone, excludedUserIds }),
    db.select({ cnt: count() }).from(reminderRules).where(eq(reminderRules.isEnabled, true)),
    loadAdminPlaybackHealthMetrics({ windowHours, excludedUserIds }),
    loadAdminPlaybackClientHealthMetrics({ windowHours, excludedUserIds }),
    // AN-11: split exercise-video opens by program type. Playback events carry
    // only media_id (no program context), so we classify each video by membership:
    // a video that appears in any promo program → promo (general/baseline content
    // every patient gets); a video only in doctor/course programs → assigned
    // (client-specific). bool_or keeps each media in exactly one bucket (no double
    // count). Bucketing + top-15 per bucket happens in JS below.
    db.execute<{ media_id: string; title: string; in_promo: boolean; n: string }>(sql`
      WITH exercise_media_raw AS (
        SELECT
          (regexp_match(elem->>'url', '/api/media/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})'))[1]::uuid AS media_id,
          tpisi.snapshot->>'title' AS title,
          tpi.assignment_source AS assignment_source
        FROM treatment_program_instance_stage_items tpisi
        JOIN treatment_program_instance_stages tpis ON tpis.id = tpisi.stage_id
        JOIN treatment_program_instances tpi ON tpi.id = tpis.instance_id
        CROSS JOIN jsonb_array_elements(tpisi.snapshot->'media') AS elem
        WHERE tpisi.item_type = 'exercise'
          AND elem->>'type' = 'video'
          AND (regexp_match(elem->>'url', '/api/media/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})'))[1] IS NOT NULL
      ),
      exercise_media AS (
        SELECT
          media_id,
          (array_agg(title ORDER BY title) FILTER (WHERE title IS NOT NULL))[1] AS title,
          bool_or(assignment_source = 'promo') AS in_promo
        FROM exercise_media_raw
        GROUP BY media_id
      )
      SELECT
        em.media_id::text AS media_id,
        em.title,
        em.in_promo,
        COUNT(mpre.id)::text AS n
      FROM exercise_media em
      JOIN media_playback_resolution_events mpre ON mpre.media_id = em.media_id
      WHERE mpre.resolved_at >= ${windowCutoffSql}
        ${exerciseUserExcludeSql}
      GROUP BY em.media_id, em.title, em.in_promo
      ORDER BY COUNT(mpre.id) DESC
    `),
  ]);

  const pushOpensHourly = mergePushOpenBuckets([
    ...pushOpenHourlyRows.map((r) => ({ bucket: r.bucket, eventType: "push_open", n: r.n })),
    ...pushSentHourlyRows.map((r) => ({ bucket: r.bucket, eventType: "push_sent", n: r.n })),
  ]);
  const pushOpensDaily = mergePushOpenBuckets([
    ...pushOpenDailyRows.map((r) => ({ bucket: r.bucket, eventType: "push_open", n: r.n })),
    ...pushSentDailyRows.map((r) => ({ bucket: r.bucket, eventType: "push_sent", n: r.n })),
  ]);
  const pushOpensSummary = summarizePushOpens(pushOpensHourly);

  const practiceBySource: Record<string, number> = {};
  for (const r of practiceSourceRows) {
    practiceBySource[r.source] = Number(r.n ?? 0);
  }

  const reminderSendsLast24hClock = buildReminderSendsLast24hClock(
    mergeOccurrenceHourly(
      occClockRows.map((r) => ({ bucket: r.bucket, status: r.status, n: r.n })),
    ),
  );

  const reminderRulesEnabledCount = Number(reminderRulesEnabledRow[0]?.cnt ?? 0);
  const avgVideoDurationSeconds = Number(avgVideoDurationRow[0]?.avgSeconds ?? 0);
  const warmupVideoEstimatedWatchMinutes = estimateWatchMinutes({
    totalSeconds: Number(warmupWatchMinutesRow[0]?.totalSeconds ?? 0),
    eventCount: Number(warmupViewsCountRow[0]?.n ?? 0),
    avgSecondsFallback: avgVideoDurationSeconds,
  });
  const videoPlaybackEstimatedWatchMinutes = estimateWatchMinutes({
    totalSeconds: Number(videoWatchMinutesRow[0]?.totalSeconds ?? 0),
    eventCount: Number(videoResolutionCountRow[0]?.n ?? 0),
    avgSecondsFallback: avgVideoDurationSeconds,
  });

  return {
    windowHours,
    displayTimezone,
    peopleWithNotifications,
    reminderSendsLast24hClock,
    reminderRulesEnabledCount,
    occurrenceHistoryHourly: mergeOccurrenceHourly(
      occRows.map((r) => ({ bucket: r.bucket, status: r.status, n: r.n })),
    ),
    occurrenceHistoryDaily: mergeOccurrenceHourly(
      occDailyRows.map((r) => ({ bucket: r.bucket, status: r.status, n: r.n })),
    ),
    pushOpensSummary,
    pushOpensHourly,
    pushOpensDaily,
    practiceBySource,
    practiceTopPages: practicePageRows.map((r) => ({
      contentPageId: r.contentPageId,
      section: r.section,
      slug: r.slug,
      count: Number(r.n ?? 0),
    })),
    warmupVideoTopPages: warmupVideoPageRows.map((r) => ({
      contentPageId: r.contentPageId,
      section: r.section,
      slug: r.slug,
      count: Number(r.n ?? 0),
    })),
    warmupVideoEstimatedWatchMinutes,
    videoPlaybackEstimatedWatchMinutes,
    ...buildExerciseVideoSplit(exerciseVideoRows.rows),
    videoPlayback,
    videoPlaybackClient,
  };
}

/** @deprecated Use {@link loadContentEngagementStats}. */
export const loadAdminReminderStats = loadContentEngagementStats;
