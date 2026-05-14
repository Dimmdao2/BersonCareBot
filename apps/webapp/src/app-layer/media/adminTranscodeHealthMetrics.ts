import { eq, sql } from "drizzle-orm";
import { getPool } from "@/app-layer/db/client";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { logger } from "@/app-layer/logging/logger";
import {
  legacyHlsBackfillCandidateWhereClause,
  legacyHlsReconcileEligibleForEnqueueSqlFilter,
  mediaReadableSql,
  VIDEO_HLS_LEGACY_MAX_OBJECT_BYTES,
} from "@/app-layer/media/videoHlsLegacyBackfill";
import { mediaTranscodeJobs } from "../../../db/schema";

export type AdminTranscodeHealthMetrics = {
  pendingCount: number;
  processingCount: number;
  doneLastHour: number;
  failedLastHour: number;
  /** `done` with non-null `finished_at`, rolling **24 h** UTC window. */
  doneLast24h: number;
  /** `failed` with non-null `finished_at`, rolling **24 h** UTC window. */
  failedLast24h: number;
  /** Lifetime total terminal `done` (non-null `finished_at`). */
  doneLifetime: number;
  /** Lifetime total terminal `failed` (non-null `finished_at`). */
  failedLifetime: number;
  /** Average wall time for successfully finished jobs in the last UTC hour; null if none or timestamps missing. */
  avgProcessingMsDoneLastHour: number | null;
  /** Age of oldest pending job by `created_at`, seconds; null if no pending. */
  oldestPendingAgeSeconds: number | null;
  /** Legacy reconcile candidate pool semantics (`includeFailed: false` + enqueue size cap); matches health vs cron batch. */
  legacyReconcileCandidateCountWithinSizeCap: number;
  /** Readable catalog videos marked ready with non-empty HLS master key (successful streaming variant present). */
  readableVideoReadyWithHlsCount: number;
};

function parseCountText(raw: string | undefined): number {
  if (raw == null || raw.trim().length === 0) return 0;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : 0;
}

async function loadMediaFilesCountsViaPool(): Promise<{
  legacyReconcileCandidateCountWithinSizeCap: number;
  readableVideoReadyWithHlsCount: number;
}> {
  const pool = getPool();
  const core = legacyHlsBackfillCandidateWhereClause("m", false);
  const sz = legacyHlsReconcileEligibleForEnqueueSqlFilter("m", VIDEO_HLS_LEGACY_MAX_OBJECT_BYTES);
  const readable = mediaReadableSql("m");

  const [candidatesResult, readyHlsResult] = await Promise.all([
    pool.query<{ c: string }>(
      `SELECT count(*)::text AS c FROM media_files m WHERE ${core} AND ${sz}`,
      [],
    ),
    pool.query<{ c: string }>(
      `SELECT count(*)::text AS c
       FROM media_files m
       WHERE m.mime_type ILIKE 'video/%'
         AND ${readable}
         AND m.video_processing_status = 'ready'
         AND m.hls_master_playlist_s3_key IS NOT NULL
         AND trim(m.hls_master_playlist_s3_key) <> ''`,
      [],
    ),
  ]);

  return {
    legacyReconcileCandidateCountWithinSizeCap: parseCountText(candidatesResult.rows[0]?.c),
    readableVideoReadyWithHlsCount: parseCountText(readyHlsResult.rows[0]?.c),
  };
}

/**
 * Aggregates transcode queue metrics for `/api/admin/system-health` (best-effort; throws on DB errors).
 */
export async function loadAdminTranscodeHealthMetrics(): Promise<AdminTranscodeHealthMetrics> {
  const db = getDrizzle();

  const hourWindow = sql`(${mediaTranscodeJobs.finishedAt})::timestamptz >= (now() - interval '1 hour')`;
  const dayWindow = sql`(${mediaTranscodeJobs.finishedAt})::timestamptz >= (now() - interval '24 hours')`;

  const [
    pendingRow,
    processingRow,
    doneRow,
    failedRow,
    done24Row,
    failed24Row,
    doneLifeRow,
    failedLifeRow,
    avgRow,
    oldestRow,
    mediaExtras,
  ] = await Promise.all([
    db
      .select({ c: sql<number>`count(*)::int`.mapWith(Number) })
      .from(mediaTranscodeJobs)
      .where(eq(mediaTranscodeJobs.status, "pending")),
    db
      .select({ c: sql<number>`count(*)::int`.mapWith(Number) })
      .from(mediaTranscodeJobs)
      .where(eq(mediaTranscodeJobs.status, "processing")),
    db
      .select({ c: sql<number>`count(*)::int`.mapWith(Number) })
      .from(mediaTranscodeJobs)
      .where(
        sql`${mediaTranscodeJobs.status} = 'done'
            AND ${mediaTranscodeJobs.finishedAt} IS NOT NULL
            AND ${hourWindow}`,
      ),
    db
      .select({ c: sql<number>`count(*)::int`.mapWith(Number) })
      .from(mediaTranscodeJobs)
      .where(
        sql`${mediaTranscodeJobs.status} = 'failed'
            AND ${mediaTranscodeJobs.finishedAt} IS NOT NULL
            AND ${hourWindow}`,
      ),
    db
      .select({ c: sql<number>`count(*)::int`.mapWith(Number) })
      .from(mediaTranscodeJobs)
      .where(
        sql`${mediaTranscodeJobs.status} = 'done'
            AND ${mediaTranscodeJobs.finishedAt} IS NOT NULL
            AND ${dayWindow}`,
      ),
    db
      .select({ c: sql<number>`count(*)::int`.mapWith(Number) })
      .from(mediaTranscodeJobs)
      .where(
        sql`${mediaTranscodeJobs.status} = 'failed'
            AND ${mediaTranscodeJobs.finishedAt} IS NOT NULL
            AND ${dayWindow}`,
      ),
    db
      .select({ c: sql<number>`count(*)::int`.mapWith(Number) })
      .from(mediaTranscodeJobs)
      .where(sql`${mediaTranscodeJobs.status} = 'done' AND ${mediaTranscodeJobs.finishedAt} IS NOT NULL`),
    db
      .select({ c: sql<number>`count(*)::int`.mapWith(Number) })
      .from(mediaTranscodeJobs)
      .where(sql`${mediaTranscodeJobs.status} = 'failed' AND ${mediaTranscodeJobs.finishedAt} IS NOT NULL`),
    db
      .select({
        avgMs: sql<string | null>`(
          avg(extract(epoch from (
            (${mediaTranscodeJobs.finishedAt})::timestamptz - (${mediaTranscodeJobs.processingStartedAt})::timestamptz
          )) * 1000)
        )::text`,
      })
      .from(mediaTranscodeJobs)
      .where(
        sql`${mediaTranscodeJobs.status} = 'done'
            AND ${mediaTranscodeJobs.finishedAt} IS NOT NULL
            AND ${mediaTranscodeJobs.processingStartedAt} IS NOT NULL
            AND ${hourWindow}`,
      ),
    db
      .select({
        oldestSec: sql<string | null>`(
          extract(epoch from (now() - min((${mediaTranscodeJobs.createdAt})::timestamptz)))
        )::text`,
      })
      .from(mediaTranscodeJobs)
      .where(eq(mediaTranscodeJobs.status, "pending")),
    loadMediaFilesCountsViaPool(),
  ]);

  const pendingCount = pendingRow[0]?.c ?? 0;
  const processingCount = processingRow[0]?.c ?? 0;
  const doneLastHour = doneRow[0]?.c ?? 0;
  const failedLastHour = failedRow[0]?.c ?? 0;
  const doneLast24h = done24Row[0]?.c ?? 0;
  const failedLast24h = failed24Row[0]?.c ?? 0;
  const doneLifetime = doneLifeRow[0]?.c ?? 0;
  const failedLifetime = failedLifeRow[0]?.c ?? 0;

  const avgRaw = avgRow[0]?.avgMs;
  let avgProcessingMsDoneLastHour: number | null = null;
  if (avgRaw != null && avgRaw.trim().length > 0) {
    const n = Number.parseFloat(avgRaw);
    avgProcessingMsDoneLastHour = Number.isFinite(n) ? Math.round(n) : null;
  }

  const oldestRaw = oldestRow[0]?.oldestSec;
  let oldestPendingAgeSeconds: number | null = null;
  if (pendingCount > 0 && oldestRaw != null && oldestRaw.trim().length > 0) {
    const n = Number.parseFloat(oldestRaw);
    oldestPendingAgeSeconds = Number.isFinite(n) ? Math.floor(n) : null;
  }

  return {
    pendingCount,
    processingCount,
    doneLastHour,
    failedLastHour,
    doneLast24h,
    failedLast24h,
    doneLifetime,
    failedLifetime,
    avgProcessingMsDoneLastHour,
    oldestPendingAgeSeconds,
    legacyReconcileCandidateCountWithinSizeCap: mediaExtras.legacyReconcileCandidateCountWithinSizeCap,
    readableVideoReadyWithHlsCount: mediaExtras.readableVideoReadyWithHlsCount,
  };
}

export async function loadAdminTranscodeHealthMetricsSafe(): Promise<AdminTranscodeHealthMetrics | null> {
  try {
    return await loadAdminTranscodeHealthMetrics();
  } catch (e) {
    logger.error({ err: e }, "admin_transcode_health_metrics_failed");
    return null;
  }
}
