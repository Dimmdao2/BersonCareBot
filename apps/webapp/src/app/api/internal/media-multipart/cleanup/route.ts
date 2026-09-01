import { NextResponse } from 'next/server';
import { enterWithDbInfraPrincipal } from '@bersoncare/db-principal';
import { verifyInternalJobBearer } from '@/middleware/internalJobBearer';
import { getPool } from '@/app-layer/db/client';
import { logger } from '@/app-layer/logging/logger';
import { withMultipartSessionLock } from '@/app-layer/locks/multipartSessionLock';
import {
  listExpiredActiveUploadSessions,
  stageExpiredMultipartSessionForPurgeTx,
} from '@/app-layer/media/mediaUploadSessionsRepo';
import { recordOperatorCronJobTickBestEffort } from '@/app-layer/operator-health/recordOperatorCronJobTick';
import {
  OPERATOR_MEDIA_JOB_FAMILY,
  OPERATOR_MEDIA_MULTIPART_CLEANUP_JOB_KEY,
} from '@/modules/operator-health/reconcileJobKeys';

/**
 * Expired multipart sessions are HANDED to the one media cleanup state machine
 * (`media_files.status = 'pending_delete'`, drained by `/api/internal/media-pending-delete/purge`
 * with `delete_attempts` / `next_attempt_at` backoff), which aborts the multipart upload in S3 and
 * only then deletes the row.
 *
 * This tick deliberately performs NO S3 call and deletes NO row. Audit §D1: the previous shape
 * deleted `media_files` first (cascading away `media_upload_sessions`, the only holder of
 * `s3_key` + `upload_id`) and then fired a best-effort `AbortMultipartUpload` whose failure was
 * swallowed — the parts stayed in the bucket with nothing left in the database able to name them,
 * and the tick still reported success. A row that fails here now stays selectable for the next tick
 * instead of being pushed into a terminal `expired` state no selector ever looks at again, and
 * `errors > 0` makes the tick FAIL.
 */
export async function POST(request: Request) {
  const auth = verifyInternalJobBearer(request);
  if (!auth.ok) return auth.response;
  // INFRA: cleanup scans expired multipart sessions across organizations and purges abandoned rows.
  enterWithDbInfraPrincipal({ source: 'api/internal/media-multipart/cleanup:POST' });

  let limit = 25;
  try {
    const url = new URL(request.url);
    const q = url.searchParams.get('limit');
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
        const outcome = await withMultipartSessionLock(pool, row.id, (client) =>
          stageExpiredMultipartSessionForPurgeTx(client, row.id),
        );
        if (outcome !== 'skipped') {
          cleaned += 1;
        }
      } catch (e) {
        // Staging is a pure DB transition. A failure here is a real fault, not a state to bury: the
        // session keeps its active status, so the next tick selects it again, and this tick is red.
        errors += 1;
        logger.error(
          { err: e, sessionId: row.id },
          '[internal/media-multipart/cleanup] row_failed',
        );
      }
    }
    // Stage 4 of the audit: `errors > 0` never becomes `success: true`.
    const success = errors === 0;
    await recordOperatorCronJobTickBestEffort({
      jobFamily: OPERATOR_MEDIA_JOB_FAMILY,
      jobKey: OPERATOR_MEDIA_MULTIPART_CLEANUP_JOB_KEY,
      startedAtIso,
      durationMs: Date.now() - startedAt,
      success,
      ...(success ? {} : { error: `${errors} expired session(s) failed to stage for purge` }),
      metaJson: { cleaned, errors },
    });
    return NextResponse.json({ ok: success, cleaned, errors }, { status: success ? 200 : 500 });
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
    logger.error({ err: e }, '[internal/media-multipart/cleanup] failed');
    return NextResponse.json({ ok: false, error: 'cleanup_failed' }, { status: 500 });
  }
}
