import { eq, sql } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { logger } from "@/app-layer/logging/logger";
import { mediaTranscodeJobs } from "../../../db/schema";

export type AdminTranscodeHealthMetrics = {
  pendingCount: number;
  processingCount: number;
  doneLastHour: number;
  failedLastHour: number;
  /** Average wall time for successfully finished jobs in the last UTC hour; null if none or timestamps missing. */
  avgProcessingMsDoneLastHour: number | null;
  /** Age of oldest pending job by `created_at`, seconds; null if no pending. */
  oldestPendingAgeSeconds: number | null;
};

/**
 * Aggregates transcode queue metrics for `/api/admin/system-health` (best-effort; throws on DB errors).
 */
export async function loadAdminTranscodeHealthMetrics(): Promise<AdminTranscodeHealthMetrics> {
  const db = getDrizzle();

  const hourWindow = sql`(${mediaTranscodeJobs.finishedAt})::timestamptz >= (now() - interval '1 hour')`;

  const [pendingRow, processingRow, doneRow, failedRow, avgRow, oldestRow] = await Promise.all([
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
  const processingCount = processingRow[0]?.c ?? 0;
  const doneLastHour = doneRow[0]?.c ?? 0;
  const failedLastHour = failedRow[0]?.c ?? 0;

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
    avgProcessingMsDoneLastHour,
    oldestPendingAgeSeconds,
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
