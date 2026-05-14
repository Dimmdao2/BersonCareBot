import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { env } from "@/config/env";
import { logger } from "@/app-layer/logging/logger";
import {
  runVideoHlsLegacyBackfill,
  VIDEO_HLS_LEGACY_MAX_OBJECT_BYTES,
} from "@/app-layer/media/videoHlsLegacyBackfill";
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
const RECONCILE_MAX_MEDIA_BYTES = VIDEO_HLS_LEGACY_MAX_OBJECT_BYTES;
const RECONCILE_SERVER_CAP = 200;

const bodySchema = z.object({
  limit: z.coerce.number().int().min(1).max(RECONCILE_SERVER_CAP).optional().default(50),
});

/** Best-effort truncation for `operator_job_status.meta_json` (no long stack traces). */
const MAX_META_ABORTED_LEN = 480;

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
  const reconcileStartedAt = Date.now();
  const startedAtIso = new Date(reconcileStartedAt).toISOString();

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

    const durationMs = Date.now() - reconcileStartedAt;
    const abortedReason =
      report.abortedReason == null
        ? null
        : String(report.abortedReason).slice(0, MAX_META_ABORTED_LEN);

    const metaJson: Record<string, unknown> = {
      queuedNew: report.enqueue.queuedNew,
      candidatesScanned: report.candidatesScanned,
      alreadyQueued: report.enqueue.alreadyQueued,
      alreadyReady: report.enqueue.alreadyReady,
      skippedOversized: report.skippedOversized,
      skippedPipelineOff: report.skippedPipelineOff,
      enqueueErrors: report.enqueue.errors,
      abortedReason,
      limitRequested: cap,
      maxSizeBytes: RECONCILE_MAX_MEDIA_BYTES,
    };

    // Secondary: DB tick must not turn a successful reconcile into HTTP 500 if the row write fails.
    try {
      await buildAppDeps().operatorHealthWrite.recordMediaTranscodeReconcileSuccess({
        startedAtIso,
        durationMs,
        metaJson,
      });
    } catch (tickErr) {
      logger.warn({ err: tickErr }, "[internal/media-transcode/reconcile] operator_job_status success tick failed");
    }

    return NextResponse.json({ ok: true, report });
  } catch (e) {
    logger.error({ err: e }, "[internal/media-transcode/reconcile] failed");
    const durationMs = Date.now() - reconcileStartedAt;
    const msg = e instanceof Error ? e.message : String(e);
    try {
      await buildAppDeps().operatorHealthWrite.recordMediaTranscodeReconcileFailure({
        startedAtIso,
        durationMs,
        error: msg,
      });
    } catch (tickErr) {
      logger.warn({ err: tickErr }, "[internal/media-transcode/reconcile] operator_job_status failure tick failed");
    }
    return NextResponse.json({ ok: false, error: "reconcile_failed" }, { status: 500 });
  }
}
