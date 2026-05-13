import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/config/env";
import { logger } from "@/app-layer/logging/logger";
import { runVideoHlsLegacyBackfill } from "@/app-layer/media/videoHlsLegacyBackfill";
import { getConfigBool } from "@/modules/system-settings/configAdapter";

function bearerMatchesSecret(token: string, secret: string): boolean {
  const a = Buffer.from(token, "utf8");
  const b = Buffer.from(secret, "utf8");
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

/** Matches `video-hls-backfill-legacy` default max object size (3 GiB). */
const RECONCILE_MAX_MEDIA_BYTES = 3 * 1024 * 1024 * 1024;
const RECONCILE_SERVER_CAP = 200;

const bodySchema = z.object({
  limit: z.coerce.number().int().min(1).max(RECONCILE_SERVER_CAP).optional().default(50),
});

/**
 * POST — batch enqueue legacy video rows without HLS (one cron tick). Reuses phase-07 backfill logic.
 * Secured with `Authorization: Bearer <INTERNAL_JOB_SECRET>`.
 * Requires `video_hls_pipeline_enabled` and `video_hls_reconcile_enabled`.
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

  const pipelineOn = await getConfigBool("video_hls_pipeline_enabled", false);
  if (!pipelineOn) {
    return NextResponse.json({ ok: false, error: "pipeline_disabled" }, { status: 503 });
  }

  const reconcileOn = await getConfigBool("video_hls_reconcile_enabled", false);
  if (!reconcileOn) {
    return NextResponse.json({ ok: false, error: "reconcile_disabled" }, { status: 503 });
  }

  const rawText = await request.text();
  let bodyJson: unknown = {};
  if (rawText.trim().length > 0) {
    try {
      bodyJson = JSON.parse(rawText) as unknown;
    } catch {
      return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
    }
  }
  const parsed = bodySchema.safeParse(bodyJson);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const cap = Math.min(parsed.data.limit, RECONCILE_SERVER_CAP);

  try {
    const report = await runVideoHlsLegacyBackfill({
      dryRun: false,
      limit: cap,
      batchSize: cap,
      sleepMsBetweenBatches: 0,
      cursorAfterMediaId: null,
      cutoffCreatedBefore: null,
      includeFailed: false,
      maxSizeBytes: RECONCILE_MAX_MEDIA_BYTES,
      requirePipelineEnabled: true,
      defaultRunCap: RECONCILE_SERVER_CAP,
    });

    logger.info(
      {
        candidatesScanned: report.candidatesScanned,
        queuedNew: report.enqueue.queuedNew,
        alreadyQueued: report.enqueue.alreadyQueued,
        alreadyReady: report.enqueue.alreadyReady,
        errors: report.enqueue.errors,
        abortedReason: report.abortedReason,
      },
      "[internal/media-transcode/reconcile] batch",
    );

    return NextResponse.json({ ok: true, report });
  } catch (e) {
    logger.error({ err: e }, "[internal/media-transcode/reconcile] failed");
    return NextResponse.json({ ok: false, error: "reconcile_failed" }, { status: 500 });
  }
}
