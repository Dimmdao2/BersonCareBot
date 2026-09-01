import { NextResponse } from 'next/server';
import { enterWithDbInfraPrincipal } from '@bersoncare/db-principal';
import { verifyInternalJobBearer } from '@/middleware/internalJobBearer';
import { logger } from '@/app-layer/logging/logger';
import { recordOperatorCronJobTickBestEffort } from '@/app-layer/operator-health/recordOperatorCronJobTick';
import {
  OPERATOR_MEDIA_JOB_FAMILY,
  OPERATOR_MEDIA_PREVIEW_PROCESS_JOB_KEY,
} from '@/modules/operator-health/reconcileJobKeys';

/**
 * POST — generate preview JPEGs for `media_files` rows with `preview_status = 'pending'`.
 * Secured with `Authorization: Bearer <INTERNAL_JOB_SECRET>`.
 * For production cron, prefer `pnpm run media-preview:tick` (separate process); this route stays for loopback/manual triggers.
 */
export async function POST(request: Request) {
  const auth = verifyInternalJobBearer(request);
  if (!auth.ok) return auth.response;
  enterWithDbInfraPrincipal({ source: 'api/internal/media-preview/process:POST' });

  let limit = 10;
  try {
    const url = new URL(request.url);
    const q = url.searchParams.get('limit');
    if (q) limit = Number.parseInt(q, 10);
  } catch {
    /* ignore */
  }

  const startedAt = Date.now();
  const startedAtIso = new Date(startedAt).toISOString();

  try {
    const { processMediaPreviewBatch } = await import('@/app-layer/media/mediaPreviewWorker');
    const { processed, errors } = await processMediaPreviewBatch(
      Number.isFinite(limit) ? limit : 10,
    );
    const success = errors === 0;
    await recordOperatorCronJobTickBestEffort({
      jobFamily: OPERATOR_MEDIA_JOB_FAMILY,
      jobKey: OPERATOR_MEDIA_PREVIEW_PROCESS_JOB_KEY,
      startedAtIso,
      durationMs: Date.now() - startedAt,
      success,
      metaJson: { processed, errors },
    });
    if (!success) {
      return NextResponse.json({ ok: false, processed, errors }, { status: 500 });
    }
    return NextResponse.json({ ok: true, processed, errors });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await recordOperatorCronJobTickBestEffort({
      jobFamily: OPERATOR_MEDIA_JOB_FAMILY,
      jobKey: OPERATOR_MEDIA_PREVIEW_PROCESS_JOB_KEY,
      startedAtIso,
      durationMs: Date.now() - startedAt,
      success: false,
      error: msg,
    });
    logger.error({ err: e }, '[internal/media-preview/process] failed');
    return NextResponse.json({ ok: false, error: 'process_failed' }, { status: 500 });
  }
}
