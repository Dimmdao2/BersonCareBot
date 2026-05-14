import { and, desc, gte, inArray, sql } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { mediaHlsProxyErrorEvents } from "../../../db/schema";
import { HLS_PROXY_REASON_CODES_DB } from "@/modules/media/hlsProxyTelemetry";

export const ADMIN_HLS_PROXY_METRICS_WINDOW_HOURS = 24;
export const ADMIN_HLS_PROXY_DEGRADED_MIN_ERRORS_1H = 20;
export const ADMIN_HLS_PROXY_CRITICAL_SHARE_MIN_DENOM = 8;
export const ADMIN_HLS_PROXY_CRITICAL_SHARE_1H = 0.35;

function cutoffIso(hours: number): string {
  return new Date(Date.now() - Math.max(1, hours) * 60 * 60 * 1000).toISOString();
}

export type AdminHlsProxyHealthMetrics = {
  windowHours: number;
  errorsTotal24h: number;
  errorsTotal1h: number;
  byReason: Record<string, number>;
  byReasonLast1h: Record<string, number>;
  recent: Array<{
    createdAt: string;
    mediaId: string;
    reasonCode: string;
    artifactKind: string;
  }>;
  degraded: boolean;
};

function emptyByReason(): Record<string, number> {
  const o: Record<string, number> = {};
  for (const c of HLS_PROXY_REASON_CODES_DB) o[c] = 0;
  return o;
}

function computeDegraded(errorsTotal1h: number, critical1h: number): boolean {
  if (errorsTotal1h >= ADMIN_HLS_PROXY_DEGRADED_MIN_ERRORS_1H) return true;
  if (errorsTotal1h >= ADMIN_HLS_PROXY_CRITICAL_SHARE_MIN_DENOM) {
    const share = critical1h / errorsTotal1h;
    return share >= ADMIN_HLS_PROXY_CRITICAL_SHARE_1H;
  }
  return false;
}

export async function loadAdminHlsProxyHealthMetrics(opts?: {
  windowHours?: number;
}): Promise<AdminHlsProxyHealthMetrics> {
  const windowHours =
    typeof opts?.windowHours === "number" && Number.isFinite(opts.windowHours) && opts.windowHours > 0
      ? Math.floor(opts.windowHours)
      : ADMIN_HLS_PROXY_METRICS_WINDOW_HOURS;
  const db = getDrizzle();
  const cutoff24 = cutoffIso(windowHours);
  const cutoff1h = cutoffIso(1);
  const criticalReasons = ["upstream_403", "missing_object"] as const;

  const [totals24, totals1h, critical1hRow, recentRows] = await Promise.all([
    db
      .select({
        reasonCode: mediaHlsProxyErrorEvents.reasonCode,
        c: sql<string>`count(*)::text`,
      })
      .from(mediaHlsProxyErrorEvents)
      .where(gte(mediaHlsProxyErrorEvents.createdAt, cutoff24))
      .groupBy(mediaHlsProxyErrorEvents.reasonCode),
    db
      .select({
        reasonCode: mediaHlsProxyErrorEvents.reasonCode,
        c: sql<string>`count(*)::text`,
      })
      .from(mediaHlsProxyErrorEvents)
      .where(gte(mediaHlsProxyErrorEvents.createdAt, cutoff1h))
      .groupBy(mediaHlsProxyErrorEvents.reasonCode),
    db
      .select({ c: sql<string>`count(*)::text` })
      .from(mediaHlsProxyErrorEvents)
      .where(
        and(
          gte(mediaHlsProxyErrorEvents.createdAt, cutoff1h),
          inArray(mediaHlsProxyErrorEvents.reasonCode, [...criticalReasons]),
        ),
      ),
    db
      .select({
        createdAt: mediaHlsProxyErrorEvents.createdAt,
        mediaId: mediaHlsProxyErrorEvents.mediaId,
        reasonCode: mediaHlsProxyErrorEvents.reasonCode,
        artifactKind: mediaHlsProxyErrorEvents.artifactKind,
      })
      .from(mediaHlsProxyErrorEvents)
      .orderBy(desc(mediaHlsProxyErrorEvents.createdAt))
      .limit(12),
  ]);

  const byReason = emptyByReason();
  let errorsTotal24h = 0;
  for (const row of totals24) {
    const n = Number.parseInt(row.c, 10) || 0;
    byReason[row.reasonCode] = (byReason[row.reasonCode] ?? 0) + n;
    errorsTotal24h += n;
  }

  const byReasonLast1h = emptyByReason();
  let errorsTotal1h = 0;
  for (const row of totals1h) {
    const n = Number.parseInt(row.c, 10) || 0;
    byReasonLast1h[row.reasonCode] = (byReasonLast1h[row.reasonCode] ?? 0) + n;
    errorsTotal1h += n;
  }

  const critical1h = Number.parseInt(critical1hRow[0]?.c ?? "0", 10) || 0;
  const degraded = computeDegraded(errorsTotal1h, critical1h);

  return {
    windowHours,
    errorsTotal24h,
    errorsTotal1h,
    byReason,
    byReasonLast1h,
    recent: recentRows.map((r) => ({
      createdAt: r.createdAt,
      mediaId: r.mediaId,
      reasonCode: r.reasonCode,
      artifactKind: r.artifactKind,
    })),
    degraded,
  };
}
