import { eq, sql } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { runWebappPgText } from "@/infra/db/runWebappSql";
import {
  legacyHlsBackfillCandidateWhereClause,
  legacyHlsReconcileEligibleForEnqueueSqlFilter,
  mediaReadableSql,
  VIDEO_HLS_LEGACY_MAX_OBJECT_BYTES,
} from "@/infra/repos/mediaHlsLegacySqlFilters";
import { mediaTranscodeJobs } from "../../../db/schema";

export type AdminTranscodeJobQueueMetrics = {
  pendingCount: number;
  processingCount: number;
  doneLastHour: number;
  failedLastHour: number;
  doneLast24h: number;
  failedLast24h: number;
  doneLifetime: number;
  failedLifetime: number;
  avgProcessingMsDoneLastHour: number | null;
  oldestPendingAgeSeconds: number | null;
};

function parseCountText(raw: string | undefined): number {
  if (raw == null || raw.trim().length === 0) return 0;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : 0;
}

export async function loadAdminTranscodeMediaFileCounts(): Promise<{
  legacyReconcileCandidateCountWithinSizeCap: number;
  readableVideoReadyWithHlsCount: number;
}> {
  const core = legacyHlsBackfillCandidateWhereClause("m", false);
  const sz = legacyHlsReconcileEligibleForEnqueueSqlFilter("m", VIDEO_HLS_LEGACY_MAX_OBJECT_BYTES);
  const readable = mediaReadableSql("m");

  const [candidatesResult, readyHlsResult] = await Promise.all([
    runWebappPgText<{ c: string }>(
      `SELECT count(*)::text AS c FROM media_files m WHERE ${core} AND ${sz}`,
    ),
    runWebappPgText<{ c: string }>(
      `SELECT count(*)::text AS c
       FROM media_files m
       WHERE m.mime_type ILIKE 'video/%'
         AND ${readable}
         AND m.video_processing_status = 'ready'
         AND m.hls_master_playlist_s3_key IS NOT NULL
         AND trim(m.hls_master_playlist_s3_key) <> ''`,
    ),
  ]);

  return {
    legacyReconcileCandidateCountWithinSizeCap: parseCountText(candidatesResult.rows[0]?.c),
    readableVideoReadyWithHlsCount: parseCountText(readyHlsResult.rows[0]?.c),
  };
}

export async function loadAdminTranscodeJobQueueMetrics(): Promise<AdminTranscodeJobQueueMetrics> {
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
  ]);

  const pendingCount = pendingRow[0]?.c ?? 0;
  const avgRaw = avgRow[0]?.avgMs;
  const oldestRaw = oldestRow[0]?.oldestSec;
  const avgParsed = avgRaw != null && avgRaw.trim().length > 0 ? Number.parseFloat(avgRaw) : NaN;
  const oldestParsed = oldestRaw != null && oldestRaw.trim().length > 0 ? Number.parseFloat(oldestRaw) : NaN;

  return {
    pendingCount,
    processingCount: processingRow[0]?.c ?? 0,
    doneLastHour: doneRow[0]?.c ?? 0,
    failedLastHour: failedRow[0]?.c ?? 0,
    doneLast24h: done24Row[0]?.c ?? 0,
    failedLast24h: failed24Row[0]?.c ?? 0,
    doneLifetime: doneLifeRow[0]?.c ?? 0,
    failedLifetime: failedLifeRow[0]?.c ?? 0,
    avgProcessingMsDoneLastHour: Number.isFinite(avgParsed) ? Math.round(avgParsed) : null,
    oldestPendingAgeSeconds: pendingCount > 0 && Number.isFinite(oldestParsed) ? Math.floor(oldestParsed) : null,
  };
}
