import { NextResponse } from 'next/server';
import { enterWithDbInfraPrincipal } from '@bersoncare/db-principal';
import { verifyInternalJobBearer } from '@/middleware/internalJobBearer';
import { logger } from '@/app-layer/logging/logger';
import { purgePendingMediaDeleteBatch } from '@/app-layer/media/s3MediaStorage';
import { recordOperatorCronJobTickBestEffort } from '@/app-layer/operator-health/recordOperatorCronJobTick';
import {
  OPERATOR_MEDIA_JOB_FAMILY,
  OPERATOR_MEDIA_PENDING_DELETE_PURGE_JOB_KEY,
} from '@/modules/operator-health/reconcileJobKeys';

/**
 * POST — process a batch of `media_files` rows in `pending_delete` or legacy `deleting` (S3 DeleteObject + DB row removal).
 * Secured with `Authorization: Bearer <INTERNAL_JOB_SECRET>`. Configure cron/systemd to call periodically.
 */
export async function POST(request: Request) {
  const auth = verifyInternalJobBearer(request);
  if (!auth.ok) return auth.response;
  enterWithDbInfraPrincipal({ source: 'api/internal/media-pending-delete/purge:POST' });

  let limit = 25;
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
    const { removed, errors } = await purgePendingMediaDeleteBatch(
      Number.isFinite(limit) ? limit : 25,
    );
    // Stage 4 of the systemic audit 2026-08-27: a batch job reports success only when every required
    // operation completed. A row whose S3 abort/delete failed stays retryable with bounded backoff —
    // and this tick must be RED, or the operator sees a green sweep that removed nothing.
    const success = errors === 0;
    await recordOperatorCronJobTickBestEffort({
      jobFamily: OPERATOR_MEDIA_JOB_FAMILY,
      jobKey: OPERATOR_MEDIA_PENDING_DELETE_PURGE_JOB_KEY,
      startedAtIso,
      durationMs: Date.now() - startedAt,
      success,
      ...(success ? {} : { error: `${errors} media row(s) failed S3 cleanup; retry scheduled` }),
      metaJson: { removed, errors },
    });
    return NextResponse.json({ ok: success, removed, errors }, { status: success ? 200 : 500 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await recordOperatorCronJobTickBestEffort({
      jobFamily: OPERATOR_MEDIA_JOB_FAMILY,
      jobKey: OPERATOR_MEDIA_PENDING_DELETE_PURGE_JOB_KEY,
      startedAtIso,
      durationMs: Date.now() - startedAt,
      success: false,
      error: msg,
    });
    logger.error({ err: e }, '[internal/media-pending-delete/purge] failed');
    return NextResponse.json({ ok: false, error: 'purge_failed' }, { status: 500 });
  }
}
