import { and, count, desc, eq, gte, inArray, sql, sum } from "drizzle-orm";
import { drizzleExcludeUserIdColumn } from "@/modules/analytics/analyticsAudience";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { loadAdminPlaybackHealthMetrics, type AdminPlaybackHealthMetrics } from "@/app-layer/media/adminPlaybackHealthMetrics";
import {
  loadAdminPlaybackClientHealthMetrics,
  type AdminPlaybackClientHealthMetrics,
} from "@/app-layer/media/playbackClientEvents";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";
import { productAnalyticsWindowStartHour } from "@/modules/product-analytics/buildAdminDashboard";
import { buildReminderSendsLast24hClock, type HourlyClockSlice } from "@/app-layer/stats/reminderHourlyClock";
import { patientDailyWarmupVideoViews } from "../../../db/schema/patientDailyWarmupVideoView";
import { patientPracticeCompletions } from "../../../db/schema/patientPractice";
import { productAnalyticsHourly } from "../../../db/schema/productAnalytics";
import {
  contentPages,
  reminderOccurrenceHistory,
  reminderRules,
} from "../../../db/schema/schema";
import {
  loadReminderPeopleWithNotificationsStats,
  type ReminderPeopleWithNotificationsStats,
} from "@/app-layer/stats/reminderNotificationPeopleStats";

export type ContentEngagementTopPageRow = {
  contentPageId: string;
  section: string;
  slug: string;
  count: number;
};

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

/** Час / сутки в `app_display_timezone` (`product_analytics_hourly`: push_open, push_sent). */
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

const PUSH_ANALYTICS_EVENT_TYPES = ["push_open", "push_sent"] as const;

function mergePushOpenBuckets(
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

function summarizePushOpens(buckets: PushOpenBucket[]): PushOpensSummary {
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
      AND COALESCE(rr.platform_user_id, pu.id) <> ALL(${excludedUserIds}::uuid[])
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
  const pushStartHour = productAnalyticsWindowStartHour(windowHours);
  const db = getDrizzle();

  const hourTruncOcc = sql`date_trunc('hour', timezone(${displayTimezoneSql}, ${reminderOccurrenceHistory.occurredAt}))`;
  const dayTruncOcc = sql`date_trunc('day', timezone(${displayTimezoneSql}, ${reminderOccurrenceHistory.occurredAt}))`;
  const hourTruncPush = sql`date_trunc('hour', timezone(${displayTimezoneSql}, ${productAnalyticsHourly.bucketHour}))`;
  const dayTruncPush = sql`date_trunc('day', timezone(${displayTimezoneSql}, ${productAnalyticsHourly.bucketHour}))`;
  const occurrenceAudience = reminderOccurrenceAudienceSql(excludedUserIds);
  const practiceUserExclude = drizzleExcludeUserIdColumn(
    patientPracticeCompletions.userId,
    excludedUserIds,
  );
  const warmupUserExclude = drizzleExcludeUserIdColumn(patientDailyWarmupVideoViews.userId, excludedUserIds);

  const [
    occRows,
    occDailyRows,
    occClockRows,
    pushHourlyRows,
    pushDailyRows,
    practiceSourceRows,
    practicePageRows,
    warmupVideoPageRows,
    peopleWithNotifications,
    reminderRulesEnabledRow,
    videoPlayback,
    videoPlaybackClient,
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
        bucket: sql<string>`${hourTruncPush}::text`.as("bucket"),
        eventType: productAnalyticsHourly.eventType,
        n: sum(productAnalyticsHourly.eventCount),
      })
      .from(productAnalyticsHourly)
      .where(
        and(
          gte(productAnalyticsHourly.bucketHour, pushStartHour),
          inArray(productAnalyticsHourly.eventType, [...PUSH_ANALYTICS_EVENT_TYPES]),
        ),
      )
      .groupBy(sql`1`, sql`2`)
      .orderBy(sql`1`),
    db
      .select({
        bucket: sql<string>`${dayTruncPush}::text`.as("bucket"),
        eventType: productAnalyticsHourly.eventType,
        n: sum(productAnalyticsHourly.eventCount),
      })
      .from(productAnalyticsHourly)
      .where(
        and(
          gte(productAnalyticsHourly.bucketHour, pushStartHour),
          inArray(productAnalyticsHourly.eventType, [...PUSH_ANALYTICS_EVENT_TYPES]),
        ),
      )
      .groupBy(sql`1`, sql`2`)
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
    loadReminderPeopleWithNotificationsStats({ windowHours, displayTimezone, excludedUserIds }),
    db.select({ cnt: count() }).from(reminderRules).where(eq(reminderRules.isEnabled, true)),
    loadAdminPlaybackHealthMetrics({ windowHours }),
    loadAdminPlaybackClientHealthMetrics({ windowHours }),
  ]);

  const pushOpensHourly = mergePushOpenBuckets(
    pushHourlyRows.map((r) => ({ bucket: r.bucket, eventType: r.eventType, n: r.n })),
  );
  const pushOpensDaily = mergePushOpenBuckets(
    pushDailyRows.map((r) => ({ bucket: r.bucket, eventType: r.eventType, n: r.n })),
  );
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
    videoPlayback,
    videoPlaybackClient,
  };
}

/** @deprecated Use {@link loadContentEngagementStats}. */
export const loadAdminReminderStats = loadContentEngagementStats;
