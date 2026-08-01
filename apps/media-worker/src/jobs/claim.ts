import type { Pool } from 'pg';
import type { Logger } from '../logger.js';
import {
  runMediaWorkerClientPgText,
  runMediaWorkerPgText,
} from '../runMediaWorkerSql.js';
import { startMediaWorkerTransaction } from '../withClient.js';

export type ClaimedJob = {
  id: string;
  mediaId: string;
  organizationId: string | null;
  /** `attempts` column after successful claim (includes increment for this run). */
  attempts: number;
};

export async function reclaimStaleProcessing(
  pool: Pool,
  staleLockMinutes: number,
  log: Logger,
): Promise<number> {
  const r = await runMediaWorkerPgText(
    pool,
    `UPDATE media_transcode_jobs
     SET status = 'pending',
         locked_at = NULL,
         locked_by = NULL,
         processing_started_at = NULL,
         finished_at = NULL,
         updated_at = now(),
         last_error = COALESCE(last_error, '') || ' [stale_lock_reclaimed]'
     WHERE status = 'processing'
       AND locked_at IS NOT NULL
       AND locked_at < now() - ($1::int * interval '1 minute')`,
    [staleLockMinutes],
  );
  const n = r.rowCount ?? 0;
  if (n > 0) {
    log.info({ reclaimed: n, staleLockMinutes }, 'reclaimed stale transcode jobs');
  }
  return n;
}

/**
 * Claim one pending job using `FOR UPDATE SKIP LOCKED` + transition to `processing`.
 */
export async function claimNextJob(pool: Pool, lockedBy: string): Promise<ClaimedJob | null> {
  const tx = await startMediaWorkerTransaction(pool);
  const client = tx.client;
  try {
    const sel = await runMediaWorkerClientPgText<{
      id: string;
      job_organization_id: string | null;
      media_organization_id: string | null;
    }>(
      client,
      `SELECT j.id,
              j.organization_id AS job_organization_id,
              mf.organization_id AS media_organization_id
       FROM media_transcode_jobs AS j
       LEFT JOIN media_files AS mf ON mf.id = j.media_id
       WHERE j.status = 'pending'
         AND (j.next_attempt_at IS NULL OR j.next_attempt_at <= now())
       ORDER BY j.created_at ASC
       FOR UPDATE OF j SKIP LOCKED
       LIMIT 1`,
    );
    const row = sel.rows[0];
    if (!row) {
      await tx.rollback();
      return null;
    }
    if (
      !row.job_organization_id?.trim() ||
      !row.media_organization_id?.trim() ||
      row.job_organization_id !== row.media_organization_id
    ) {
      await runMediaWorkerClientPgText(
        client,
        `UPDATE media_transcode_jobs
         SET status = 'failed',
             attempts = attempts + 1,
             locked_at = now(),
             locked_by = $2,
             last_error = 'organization_invariant_violation',
             next_attempt_at = NULL,
             processing_started_at = NULL,
             finished_at = now(),
             updated_at = now()
         WHERE id = $1::uuid AND status = 'pending'`,
        [row.id, lockedBy],
      );
      await tx.commit();
      return null;
    }
    const upd = await runMediaWorkerClientPgText<{
      id: string;
      media_id: string;
      organization_id: string | null;
      attempts: number;
    }>(
      client,
      `UPDATE media_transcode_jobs
       SET status = 'processing',
           locked_at = now(),
           locked_by = $2,
           attempts = attempts + 1,
           processing_started_at = now(),
           finished_at = NULL,
           updated_at = now()
       WHERE id = $1::uuid
         AND status = 'pending'
       RETURNING id, media_id, organization_id, attempts`,
      [row.id, lockedBy],
    );
    const job = upd.rows[0];
    if (!job) {
      await tx.rollback();
      return null;
    }
    await tx.commit();
    return {
      id: job.id,
      mediaId: job.media_id,
      organizationId: job.organization_id,
      attempts: job.attempts,
    };
  } catch (e) {
    try {
      await tx.rollback();
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    await tx.release();
  }
}
