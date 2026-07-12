import type { Pool } from "pg";
import type { Logger } from "../logger.js";
import { startMediaWorkerTransaction } from "../withClient.js";

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
  const r = await pool.query(
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
    log.info({ reclaimed: n, staleLockMinutes }, "reclaimed stale transcode jobs");
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
    const sel = await client.query<{ id: string }>(
      `SELECT id FROM media_transcode_jobs
       WHERE status = 'pending'
         AND (next_attempt_at IS NULL OR next_attempt_at <= now())
       ORDER BY created_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1`,
    );
    const row = sel.rows[0];
    if (!row) {
      await tx.rollback();
      return null;
    }
    const upd = await client.query<{
      id: string;
      media_id: string;
      organization_id: string | null;
      attempts: number;
    }>(
      `UPDATE media_transcode_jobs AS j
       SET status = 'processing',
           locked_at = now(),
           locked_by = $2,
           attempts = attempts + 1,
           organization_id = COALESCE(j.organization_id, mf.organization_id),
           processing_started_at = now(),
           finished_at = NULL,
           updated_at = now()
       FROM media_files AS mf
       WHERE j.id = $1::uuid
         AND j.status = 'pending'
         AND mf.id = j.media_id
       RETURNING j.id, j.media_id, j.organization_id, j.attempts`,
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
