import { getPool } from "@/infra/db/client";
import { MEDIA_READABLE_STATUS_SQL } from "@/infra/repos/s3MediaStorage";

export type EnqueueTranscodeResult =
  | { ok: true; kind: "queued"; jobId: string; alreadyQueued: boolean }
  | { ok: true; kind: "already_ready" }
  | {
      ok: false;
      error: "not_found" | "not_video" | "not_readable" | "no_s3_key";
    };

/**
 * Idempotent enqueue: at most one active job per media (DB partial unique index).
 * Call only when `video_hls_pipeline_enabled` is true (checked by caller).
 */
export async function enqueueMediaTranscodeJob(mediaId: string): Promise<EnqueueTranscodeResult> {
  const pool = getPool();
  const media = await pool.query<{
    id: string;
    mime_type: string;
    s3_key: string | null;
    hls_master_playlist_s3_key: string | null;
    video_processing_status: string | null;
  }>(
    `SELECT id, mime_type, s3_key, hls_master_playlist_s3_key, video_processing_status
     FROM media_files
     WHERE id = $1::uuid AND ${MEDIA_READABLE_STATUS_SQL}`,
    [mediaId],
  );
  const row = media.rows[0];
  if (!row) {
    const exists = await pool.query<{ one: number }>(
      `SELECT 1 AS one FROM media_files WHERE id = $1::uuid LIMIT 1`,
      [mediaId],
    );
    if (!exists.rows[0]) return { ok: false, error: "not_found" };
    return { ok: false, error: "not_readable" };
  }

  if (!row.s3_key?.trim()) return { ok: false, error: "no_s3_key" };
  if (!row.mime_type.toLowerCase().startsWith("video/")) {
    return { ok: false, error: "not_video" };
  }

  if (row.hls_master_playlist_s3_key?.trim() && row.video_processing_status === "ready") {
    return { ok: true, kind: "already_ready" };
  }

  const dup = await pool.query<{ id: string }>(
    `SELECT id FROM media_transcode_jobs
     WHERE media_id = $1::uuid AND status IN ('pending', 'processing')
     LIMIT 1`,
    [mediaId],
  );
  if (dup.rows[0]) {
    return { ok: true, kind: "queued", jobId: dup.rows[0].id, alreadyQueued: true };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let jobId: string;
    try {
      const ins = await client.query<{ id: string }>(
        `INSERT INTO media_transcode_jobs (media_id, status, attempts, created_at, updated_at)
         VALUES ($1::uuid, 'pending', 0, now(), now())
         RETURNING id`,
        [mediaId],
      );
      const id = ins.rows[0]?.id;
      if (!id) {
        await client.query("ROLLBACK");
        return { ok: false, error: "not_found" };
      }
      jobId = id;
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err.code === "23505") {
        await client.query("ROLLBACK");
        const again = await pool.query<{ id: string }>(
          `SELECT id FROM media_transcode_jobs
           WHERE media_id = $1::uuid AND status IN ('pending', 'processing')
           LIMIT 1`,
          [mediaId],
        );
        const id = again.rows[0]?.id;
        if (id) return { ok: true, kind: "queued", jobId: id, alreadyQueued: true };
        throw e;
      }
      throw e;
    }

    await client.query(
      `UPDATE media_files
       SET video_processing_status = 'pending',
           video_processing_error = NULL
       WHERE id = $1::uuid`,
      [mediaId],
    );
    await client.query("COMMIT");
    return { ok: true, kind: "queued", jobId, alreadyQueued: false };
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    client.release();
  }
}
