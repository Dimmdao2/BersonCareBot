import { NextResponse } from 'next/server';
import { z } from 'zod';
import { enterWithDbInfraPrincipal } from '@bersoncare/db-principal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { verifyInternalJobBearer } from '@/middleware/internalJobBearer';
import { logger } from '@/app-layer/logging/logger';
import {
  runVideoHlsLegacyBackfill,
  VIDEO_HLS_LEGACY_MAX_OBJECT_BYTES,
} from '@/app-layer/media/videoHlsLegacyBackfill';
import { getConfigBool } from '@/modules/system-settings/configAdapter';

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
  // 500, not the usual 503: this route's manifest entry accepts 503 as a non-failure cron status
  // for pipeline_disabled/reconcile_disabled below — a missing secret must not blend into that.
  const auth = verifyInternalJobBearer(request, { notConfiguredStatus: 500 });
  if (!auth.ok) return auth.response;
  // INFRA: reconcile sweeps legacy video rows across organizations to enqueue missing HLS jobs.
  enterWithDbInfraPrincipal({ source: 'api/internal/media-transcode/reconcile:POST' });

  const pipelineOn = await getConfigBool('video_hls_pipeline_enabled');
  if (!pipelineOn) {
    return NextResponse.json({ ok: false, error: 'pipeline_disabled' }, { status: 503 });
  }

  const reconcileOn = await getConfigBool('video_hls_reconcile_enabled');
  if (!reconcileOn) {
    return NextResponse.json({ ok: false, error: 'reconcile_disabled' }, { status: 503 });
  }

  const rawText = await request.text();
  let bodyJson: unknown = {};
  if (rawText.trim().length > 0) {
    try {
      bodyJson = JSON.parse(rawText) as unknown;
    } catch {
      return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
    }
  }
  const parsed = bodySchema.safeParse(bodyJson);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
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
      '[internal/media-transcode/reconcile] batch',
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

    const failureReason = abortedReason ??
      (report.enqueue.errors > 0 ? `enqueue_errors:${report.enqueue.errors}` : null);
    if (failureReason) {
      try {
        await buildAppDeps().operatorHealthWrite.recordMediaTranscodeReconcileFailure({
          startedAtIso,
          durationMs,
          error: failureReason,
          metaJson,
        });
      } catch (tickErr) {
        logger.warn(
          { err: tickErr },
          '[internal/media-transcode/reconcile] operator_job_status failure tick failed',
        );
      }
      return NextResponse.json(
        { ok: false, error: 'reconcile_partial_failure', report },
        { status: 500 },
      );
    }

    // Secondary: DB tick must not turn a successful reconcile into HTTP 500 if the row write fails.
    try {
      await buildAppDeps().operatorHealthWrite.recordMediaTranscodeReconcileSuccess({
        startedAtIso,
        durationMs,
        metaJson,
      });
    } catch (tickErr) {
      logger.warn(
        { err: tickErr },
        '[internal/media-transcode/reconcile] operator_job_status success tick failed',
      );
    }

    return NextResponse.json({ ok: true, report });
  } catch (e) {
    logger.error({ err: e }, '[internal/media-transcode/reconcile] failed');
    const durationMs = Date.now() - reconcileStartedAt;
    const msg = e instanceof Error ? e.message : String(e);
    try {
      await buildAppDeps().operatorHealthWrite.recordMediaTranscodeReconcileFailure({
        startedAtIso,
        durationMs,
        error: msg,
        metaJson: {},
      });
    } catch (tickErr) {
      logger.warn(
        { err: tickErr },
        '[internal/media-transcode/reconcile] operator_job_status failure tick failed',
      );
    }
    return NextResponse.json({ ok: false, error: 'reconcile_failed' }, { status: 500 });
  }
}
