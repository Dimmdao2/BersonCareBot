import { and, asc, count, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { loadAdminPlaybackHealthMetrics, type AdminPlaybackHealthMetrics } from "@/app-layer/media/adminPlaybackHealthMetrics";
import {
  loadAdminPlaybackClientHealthMetrics,
  type AdminPlaybackClientHealthMetrics,
} from "@/app-layer/media/playbackClientEvents";
import { patientPracticeCompletions } from "../../../db/schema/patientPractice";
import {
  contentPages,
  reminderJournal,
  reminderOccurrenceHistory,
  reminderRules,
} from "../../../db/schema/schema";

const DEFAULT_WINDOW_HOURS = 168;
const MIN_WINDOW_HOURS = 1;
const MAX_WINDOW_HOURS = 720;

export type OccurrenceHourlyBucket = {
  bucket: string;
  sent: number;
  failed: number;
};

/** UTC-дни (`date_trunc('day', occurred_at)`). */
export type OccurrenceDailyBucket = OccurrenceHourlyBucket;

export type ContentEngagementStatsResponse = {
  windowHours: number;
  /**
   * Число строк в `reminder_rules` с `is_enabled = true` (вся таблица webapp, без дедупликации по пациенту).
   */
  reminderRulesEnabledCount: number;
  occurrenceHistoryHourly: OccurrenceHourlyBucket[];
  occurrenceHistoryDaily: OccurrenceDailyBucket[];
  journalByAction: {
    done: number;
    skipped: number;
    snoozed: number;
  };
  journalSkipReasonsTop: Array<{ reason: string; count: number }>;
  practiceBySource: Record<string, number>;
  practiceTopPages: Array<{
    contentPageId: string;
    section: string;
    slug: string;
    count: number;
  }>;
  /** Same rolling window as other blocks; reuses `loadAdminPlaybackHealthMetrics`. */
  videoPlayback: AdminPlaybackHealthMetrics;
  /** Ошибки воспроизведения в браузере; тот же helper, что `GET /api/admin/system-health` → `videoPlaybackClient`. */
  videoPlaybackClient: AdminPlaybackClientHealthMetrics;
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

/**
 * Платформенные агрегаты: напоминания, практика по страницам, метрики выдачи видео (без списков PII).
 * Используется и админкой (`/api/admin/reminder-stats`), и кабинетом врача (`/api/doctor/content-stats`).
 */
export async function loadContentEngagementStats(opts: {
  windowHours?: number;
}): Promise<ContentEngagementStatsResponse> {
  const windowHours = clampWindowHours(opts.windowHours);
  const windowCutoffSql = sql`(now() - (${windowHours}::integer * interval '1 hour'))`;
  const db = getDrizzle();

  const hourTruncOcc = sql`date_trunc('hour', ${reminderOccurrenceHistory.occurredAt})`;
  const dayTruncOcc = sql`date_trunc('day', ${reminderOccurrenceHistory.occurredAt})`;

  const [
    occRows,
    occDailyRows,
    journalRows,
    skipRows,
    practiceSourceRows,
    practicePageRows,
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
      .where(gte(reminderOccurrenceHistory.occurredAt, windowCutoffSql))
      .groupBy(hourTruncOcc, reminderOccurrenceHistory.status)
      .orderBy(asc(hourTruncOcc)),
    db
      .select({
        bucket: sql<string>`${dayTruncOcc}::text`.as("bucket"),
        status: reminderOccurrenceHistory.status,
        n: count(),
      })
      .from(reminderOccurrenceHistory)
      .where(gte(reminderOccurrenceHistory.occurredAt, windowCutoffSql))
      .groupBy(dayTruncOcc, reminderOccurrenceHistory.status)
      .orderBy(asc(dayTruncOcc)),
    db
      .select({
        action: reminderJournal.action,
        n: count(),
      })
      .from(reminderJournal)
      .where(gte(reminderJournal.createdAt, windowCutoffSql))
      .groupBy(reminderJournal.action),
    db
      .select({
        reason: sql<string>`left(btrim(${reminderJournal.skipReason}), 200)`,
        n: count(),
      })
      .from(reminderJournal)
      .where(
        and(
          eq(reminderJournal.action, "skipped"),
          gte(reminderJournal.createdAt, windowCutoffSql),
          isNotNull(reminderJournal.skipReason),
          sql`btrim(${reminderJournal.skipReason}) <> ''`,
        ),
      )
      .groupBy(sql`left(btrim(${reminderJournal.skipReason}), 200)`)
      .orderBy(desc(count()))
      .limit(20),
    db
      .select({
        source: patientPracticeCompletions.source,
        n: count(),
      })
      .from(patientPracticeCompletions)
      .where(gte(patientPracticeCompletions.completedAt, windowCutoffSql))
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
      .where(gte(patientPracticeCompletions.completedAt, windowCutoffSql))
      .groupBy(patientPracticeCompletions.contentPageId, contentPages.section, contentPages.slug)
      .orderBy(desc(count()))
      .limit(15),
    db.select({ cnt: count() }).from(reminderRules).where(eq(reminderRules.isEnabled, true)),
    loadAdminPlaybackHealthMetrics({ windowHours }),
    loadAdminPlaybackClientHealthMetrics({ windowHours }),
  ]);

  const journalByAction = { done: 0, skipped: 0, snoozed: 0 };
  for (const r of journalRows) {
    const n = Number(r.n ?? 0);
    if (r.action === "done") journalByAction.done += n;
    else if (r.action === "skipped") journalByAction.skipped += n;
    else if (r.action === "snoozed") journalByAction.snoozed += n;
  }

  const practiceBySource: Record<string, number> = {};
  for (const r of practiceSourceRows) {
    practiceBySource[r.source] = Number(r.n ?? 0);
  }

  const reminderRulesEnabledCount = Number(reminderRulesEnabledRow[0]?.cnt ?? 0);

  return {
    windowHours,
    reminderRulesEnabledCount,
    occurrenceHistoryHourly: mergeOccurrenceHourly(
      occRows.map((r) => ({ bucket: r.bucket, status: r.status, n: r.n })),
    ),
    occurrenceHistoryDaily: mergeOccurrenceHourly(
      occDailyRows.map((r) => ({ bucket: r.bucket, status: r.status, n: r.n })),
    ),
    journalByAction,
    journalSkipReasonsTop: skipRows.map((r) => ({ reason: r.reason, count: Number(r.n ?? 0) })),
    practiceBySource,
    practiceTopPages: practicePageRows.map((r) => ({
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
