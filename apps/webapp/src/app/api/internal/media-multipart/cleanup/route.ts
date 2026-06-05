import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/config/env";
import { getPool } from "@/app-layer/db/client";
import { logger } from "@/app-layer/logging/logger";
import { withMultipartSessionLock } from "@/app-layer/locks/multipartSessionLock";
import {
  deletePendingMediaFileTx,
  listExpiredActiveUploadSessions,
  lockExpiredSessionForCleanupTx,
  markUploadSessionExpired,
  markUploadSessionExpiredTx,
} from "@/app-layer/media/mediaUploadSessionsRepo";
import { s3AbortMultipartUpload } from "@/app-layer/media/s3Client";
import { recordOperatorCronJobTickBestEffort } from "@/app-layer/operator-health/recordOperatorCronJobTick";
import {
  OPERATOR_MEDIA_JOB_FAMILY,
  OPERATOR_MEDIA_MULTIPART_CLEANUP_JOB_KEY,
} from "@/modules/operator-health/reconcileJobKeys";

function bearerMatchesSecret(token: string, secret: string): boolean {
  const a = Buffer.from(token, "utf8");
  const b = Buffer.from(secret, "utf8");
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

/**
 * Expired multipart sessions: AbortMultipartUpload + remove pending media (cascade removes session rows).
 */
export async function POST(request: Request) {
  const secret = env.INTERNAL_JOB_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }

  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token || !bearerMatchesSecret(token, secret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let limit = 25;
  try {
    const url = new URL(request.url);
    const q = url.searchParams.get("limit");
    if (q) limit = Number.parseInt(q, 10);
  } catch {
    /* ignore */
  }

  const pool = getPool();
  let cleaned = 0;
  let errors = 0;
  const startedAt = Date.now();
  const startedAtIso = new Date(startedAt).toISOString();

  try {
    const rows = await listExpiredActiveUploadSessions(Number.isFinite(limit) ? limit : 25);
    for (const row of rows) {
      try {
        const outcome = await withMultipartSessionLock(pool, row.id, async (client) => {
          const s = await lockExpiredSessionForCleanupTx(client, row.id);
          if (!s) {
            return { kind: "skipped" as const };
          }
          const deleted = await deletePendingMediaFileTx(client, s.media_id);
          if (deleted === 0) {
            await markUploadSessionExpiredTx(client, s.id);
            return { kind: "expired" as const };
          }
          return { kind: "purged" as const, s3Key: s.s3_key, uploadId: s.upload_id };
        });

        if (outcome.kind === "purged") {
          await s3AbortMultipartUpload(outcome.s3Key, outcome.uploadId).catch(() => {
            /* best-effort */
          });
        }
        if (outcome.kind !== "skipped") {
          cleaned += 1;
        }
      } catch (e) {
        errors += 1;
        logger.error({ err: e, sessionId: row.id }, "[internal/media-multipart/cleanup] row_failed");
        await markUploadSessionExpired(row.id).catch(() => {
          /* ignore */
        });
      }
    }
    await recordOperatorCronJobTickBestEffort({
      jobFamily: OPERATOR_MEDIA_JOB_FAMILY,
      jobKey: OPERATOR_MEDIA_MULTIPART_CLEANUP_JOB_KEY,
      startedAtIso,
      durationMs: Date.now() - startedAt,
      success: true,
      metaJson: { cleaned, errors },
    });
    return NextResponse.json({ ok: true, cleaned, errors });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await recordOperatorCronJobTickBestEffort({
      jobFamily: OPERATOR_MEDIA_JOB_FAMILY,
      jobKey: OPERATOR_MEDIA_MULTIPART_CLEANUP_JOB_KEY,
      startedAtIso,
      durationMs: Date.now() - startedAt,
      success: false,
      error: msg,
    });
    logger.error({ err: e }, "[internal/media-multipart/cleanup] failed");
    return NextResponse.json({ ok: false, error: "cleanup_failed" }, { status: 500 });
  }
}
