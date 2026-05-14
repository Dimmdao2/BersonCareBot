import { lt, sql } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { logger } from "@/app-layer/logging/logger";
import { mediaHlsProxyErrorEvents } from "../../../db/schema";
import { type HlsProxyArtifactKind, type HlsProxyReasonCodeDb } from "@/modules/media/hlsProxyTelemetry";

export const MEDIA_HLS_PROXY_ERROR_RETENTION_DAYS_DEFAULT = 90;

function trimObjectSuffix(key: string): string | null {
  const t = key.trim();
  if (!t) return null;
  return t.length > 128 ? t.slice(-128) : t;
}

const NO_PERSIST_REASONS = new Set<HlsProxyReasonCodeDb>(["session_unauthorized", "feature_disabled"]);

export function shouldRecordMediaHlsProxyError(reason: HlsProxyReasonCodeDb): boolean {
  return !NO_PERSIST_REASONS.has(reason);
}

export async function recordMediaHlsProxyErrorEventIfNeeded(input: {
  mediaId: string;
  userId: string;
  reasonCode: HlsProxyReasonCodeDb;
  httpStatus: number;
  artifactKind: HlsProxyArtifactKind;
  objectSuffix: string;
}): Promise<void> {
  if (!shouldRecordMediaHlsProxyError(input.reasonCode)) return;
  try {
    const db = getDrizzle();
    await db.insert(mediaHlsProxyErrorEvents).values({
      mediaId: input.mediaId,
      userId: input.userId,
      reasonCode: input.reasonCode,
      httpStatus: input.httpStatus,
      artifactKind: input.artifactKind,
      objectSuffix: trimObjectSuffix(input.objectSuffix),
    });
  } catch (e) {
    logger.error(
      {
        err: e,
        mediaId: input.mediaId,
        userId: input.userId,
        reasonCode: input.reasonCode,
      },
      "media_hls_proxy_error_event_write_failed",
    );
  }
}

export async function purgeStaleMediaHlsProxyErrorEvents(input: {
  retentionDays: number;
  dryRun: boolean;
}): Promise<{ deleted: number; dryRun: boolean; retentionDays: number }> {
  const days = Math.max(1, Math.floor(input.retentionDays));
  const db = getDrizzle();
  const cutoffExpr = sql`(now() - (${days}::integer * interval '1 day'))`;

  if (input.dryRun) {
    const row = await db
      .select({ c: sql<string>`count(*)::text` })
      .from(mediaHlsProxyErrorEvents)
      .where(lt(mediaHlsProxyErrorEvents.createdAt, cutoffExpr));
    const deleted = Number.parseInt(row[0]?.c ?? "0", 10) || 0;
    return { deleted, dryRun: true, retentionDays: days };
  }

  const removed = await db
    .delete(mediaHlsProxyErrorEvents)
    .where(lt(mediaHlsProxyErrorEvents.createdAt, cutoffExpr))
    .returning({ id: mediaHlsProxyErrorEvents.id });

  return { deleted: removed.length, dryRun: false, retentionDays: days };
}
