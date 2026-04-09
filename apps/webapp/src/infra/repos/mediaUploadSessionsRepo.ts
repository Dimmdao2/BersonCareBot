import { getPool } from "@/infra/db/client";
import type { Pool, PoolClient } from "pg";

export type UploadSessionRow = {
  id: string;
  media_id: string;
  s3_key: string;
  upload_id: string;
  owner_user_id: string;
  status: string;
  expected_size_bytes: string;
  mime_type: string;
  part_size_bytes: number;
  expires_at: Date;
};

export type FinalizeMultipartResult = {
  sessionRows: number;
  mediaRows: number;
};

export type AbortMultipartDbResult =
  | { ok: "aborted"; s3Key: string; uploadId: string }
  | { ok: "already_completed" }
  | { ok: "already_final" }
  | { ok: "not_found" };

export async function insertUploadSessionTx(
  client: PoolClient,
  params: {
    sessionId: string;
    mediaId: string;
    s3Key: string;
    uploadId: string;
    ownerUserId: string;
    expectedSizeBytes: number;
    mimeType: string;
    partSizeBytes: number;
    expiresAt: Date;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO media_upload_sessions (
       id, media_id, s3_key, upload_id, owner_user_id, status,
       expected_size_bytes, mime_type, part_size_bytes, expires_at
     ) VALUES (
       $1::uuid, $2::uuid, $3, $4, $5::uuid, 'initiated',
       $6, $7, $8, $9
     )`,
    [
      params.sessionId,
      params.mediaId,
      params.s3Key,
      params.uploadId,
      params.ownerUserId,
      params.expectedSizeBytes,
      params.mimeType,
      params.partSizeBytes,
      params.expiresAt.toISOString(),
    ],
  );
}

/** Lock session for complete: initiated|uploading -> completing. Returns row or null. */
export async function claimUploadSessionForCompletingTx(
  client: PoolClient,
  sessionId: string,
  ownerUserId: string,
): Promise<UploadSessionRow | null> {
  const res = await client.query<UploadSessionRow>(
    `UPDATE media_upload_sessions
        SET status = 'completing', updated_at = now()
      WHERE id = $1::uuid
        AND owner_user_id = $2::uuid
        AND status IN ('initiated', 'uploading')
        AND expires_at > now()
      RETURNING id, media_id, s3_key, upload_id, owner_user_id, status,
                expected_size_bytes::text, mime_type, part_size_bytes, expires_at`,
    [sessionId, ownerUserId],
  );
  return res.rows[0] ?? null;
}

/** Pool-level claim (legacy callers / tests). Prefer claimUploadSessionForCompletingTx + multipart lock. */
export async function claimUploadSessionForCompleting(
  sessionId: string,
  ownerUserId: string,
): Promise<UploadSessionRow | null> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const row = await claimUploadSessionForCompletingTx(client, sessionId, ownerUserId);
    await client.query("COMMIT");
    return row;
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

/** Retry path: session already in completing (e.g. prior request died after S3 Complete). */
export async function getCompletingSessionTx(
  client: PoolClient,
  sessionId: string,
  ownerUserId: string,
): Promise<UploadSessionRow | null> {
  const res = await client.query<UploadSessionRow>(
    `SELECT id, media_id, s3_key, upload_id, owner_user_id, status,
            expected_size_bytes::text, mime_type, part_size_bytes, expires_at
       FROM media_upload_sessions
      WHERE id = $1::uuid
        AND owner_user_id = $2::uuid
        AND status = 'completing'
        AND expires_at > now()`,
    [sessionId, ownerUserId],
  );
  return res.rows[0] ?? null;
}

/** Mark completing -> failed (single transition; no revert + failed double-write). */
export async function markCompletingSessionFailedTx(
  client: PoolClient,
  sessionId: string,
  message: string,
): Promise<boolean> {
  const res = await client.query(
    `UPDATE media_upload_sessions
        SET status = 'failed', last_error = $2, updated_at = now()
      WHERE id = $1::uuid AND status = 'completing'`,
    [sessionId, message.slice(0, 2000)],
  );
  return (res.rowCount ?? 0) > 0;
}

export async function finalizeMultipartSuccessTx(
  client: PoolClient,
  sessionId: string,
  mediaId: string,
  ownerUserId: string,
): Promise<FinalizeMultipartResult> {
  const sessionRes = await client.query(
    `UPDATE media_upload_sessions
        SET status = 'completed', completed_at = now(), updated_at = now()
      WHERE id = $1::uuid
        AND media_id = $2::uuid
        AND owner_user_id = $3::uuid
        AND status = 'completing'`,
    [sessionId, mediaId, ownerUserId],
  );
  const mediaRes = await client.query(
    `UPDATE media_files SET status = 'ready' WHERE id = $1::uuid AND status = 'pending'`,
    [mediaId],
  );
  return {
    sessionRows: sessionRes.rowCount ?? 0,
    mediaRows: mediaRes.rowCount ?? 0,
  };
}

/** Idempotent: if already completed + media ready, returns { alreadyDone: true }. */
export async function tryFinalizeMultipartIdempotentTx(
  client: PoolClient,
  sessionId: string,
  mediaId: string,
  ownerUserId: string,
): Promise<{ kind: "finalized" | "already_done" | "partial"; result: FinalizeMultipartResult }> {
  const state = await client.query<{ s: string; m: string }>(
    `SELECT s.status AS s, m.status AS m
       FROM media_upload_sessions s
       JOIN media_files m ON m.id = s.media_id
      WHERE s.id = $1::uuid AND s.media_id = $2::uuid AND s.owner_user_id = $3::uuid`,
    [sessionId, mediaId, ownerUserId],
  );
  const row = state.rows[0];
  if (!row) {
    return { kind: "partial", result: { sessionRows: 0, mediaRows: 0 } };
  }
  if (row.s === "completed" && row.m === "ready") {
    return { kind: "already_done", result: { sessionRows: 0, mediaRows: 0 } };
  }
  const result = await finalizeMultipartSuccessTx(client, sessionId, mediaId, ownerUserId);
  if (result.sessionRows > 0 && result.mediaRows > 0) {
    return { kind: "finalized", result };
  }
  return { kind: "partial", result };
}

/**
 * Abort user upload: under row locks, delete pending media (cascade removes session) or detect terminal states.
 * Caller should run S3 AbortMultipartUpload after commit using returned keys when ok === "aborted".
 */
export async function abortMultipartPendingTx(
  client: PoolClient,
  sessionId: string,
  ownerUserId: string,
): Promise<AbortMultipartDbResult> {
  const sel = await client.query<SessionWithMediaRow>(
    `SELECT s.id AS session_id, s.media_id, s.s3_key, s.upload_id, s.status AS session_status, m.status AS media_status
       FROM media_upload_sessions s
       INNER JOIN media_files m ON m.id = s.media_id
      WHERE s.id = $1::uuid AND s.owner_user_id = $2::uuid
      FOR UPDATE OF s, m`,
    [sessionId, ownerUserId],
  );
  const row = sel.rows[0];
  if (!row) {
    return { ok: "not_found" };
  }

  if (row.media_status === "ready") {
    return { ok: "already_completed" };
  }

  if (["aborted", "expired", "failed", "completed"].includes(row.session_status)) {
    return { ok: "already_final" };
  }

  const del = await client.query(`DELETE FROM media_files WHERE id = $1::uuid AND status = 'pending'`, [row.media_id]);
  if ((del.rowCount ?? 0) === 0) {
    const again = await client.query<{ m: string | null }>(
      `SELECT m.status AS m
         FROM media_upload_sessions s
         LEFT JOIN media_files m ON m.id = s.media_id
        WHERE s.id = $1::uuid`,
      [sessionId],
    );
    const ms = again.rows[0]?.m;
    if (ms === "ready") {
      return { ok: "already_completed" };
    }
    return { ok: "not_found" };
  }

  return { ok: "aborted", s3Key: row.s3_key, uploadId: row.upload_id };
}

export async function markUploadSessionExpiredTx(client: PoolClient, sessionId: string): Promise<void> {
  await client.query(
    `UPDATE media_upload_sessions
        SET status = 'expired', updated_at = now(), last_error = 'expired'
      WHERE id = $1::uuid AND status IN ('initiated', 'uploading', 'completing')`,
    [sessionId],
  );
}

export async function finalizeMultipartSuccess(sessionId: string, mediaId: string): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await finalizeMultipartSuccessTx(client, sessionId, mediaId, await ownerForSession(client, sessionId));
    await client.query("COMMIT");
    if (r.sessionRows === 0 || r.mediaRows === 0) {
      throw new Error("finalize_multipart_no_rows_updated");
    }
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

async function ownerForSession(client: PoolClient, sessionId: string): Promise<string> {
  const res = await client.query<{ owner_user_id: string }>(
    `SELECT owner_user_id::text FROM media_upload_sessions WHERE id = $1::uuid`,
    [sessionId],
  );
  const id = res.rows[0]?.owner_user_id;
  if (!id) throw new Error("session_not_found");
  return id;
}

export async function markUploadSessionFailed(sessionId: string, message: string): Promise<void> {
  const pool = getPool();
  await pool.query(
    `UPDATE media_upload_sessions
        SET status = 'failed', last_error = $2, updated_at = now()
      WHERE id = $1::uuid`,
    [sessionId, message.slice(0, 2000)],
  );
}

export type GatePartUrlResult =
  | { ok: true; row: UploadSessionRow }
  | { ok: false; error: "session_not_found" | "session_expired" | "session_state_conflict" };

/** Distinguish missing session vs TTL vs wrong status for part-url (and clearer client errors). */
export async function gateUploadSessionForPartUrl(
  sessionId: string,
  ownerUserId: string,
): Promise<GatePartUrlResult> {
  const pool = getPool();
  const res = await pool.query<UploadSessionRow & { expired: boolean }>(
    `SELECT id, media_id, s3_key, upload_id, owner_user_id, status,
            expected_size_bytes::text, mime_type, part_size_bytes, expires_at,
            (expires_at <= now()) AS expired
       FROM media_upload_sessions
      WHERE id = $1::uuid AND owner_user_id = $2::uuid`,
    [sessionId, ownerUserId],
  );
  const raw = res.rows[0];
  if (!raw) {
    return { ok: false, error: "session_not_found" };
  }
  const { expired, ...row } = raw;
  if (expired) {
    return { ok: false, error: "session_expired" };
  }
  if (row.status !== "initiated" && row.status !== "uploading") {
    return { ok: false, error: "session_state_conflict" };
  }
  return { ok: true, row };
}

export type MultipartCompleteRejectError =
  | "session_not_found"
  | "session_expired"
  | "session_state_conflict";

/**
 * When claim + completing-retry both miss, explain why (for POST multipart/complete).
 */
export async function classifyMultipartCompleteRejection(
  pool: Pool,
  sessionId: string,
  ownerUserId: string,
): Promise<MultipartCompleteRejectError> {
  const res = await pool.query<{ status: string; expired: boolean }>(
    `SELECT status,
            (expires_at <= now()) AS expired
       FROM media_upload_sessions
      WHERE id = $1::uuid AND owner_user_id = $2::uuid`,
    [sessionId, ownerUserId],
  );
  const row = res.rows[0];
  if (!row) {
    return "session_not_found";
  }
  if (row.expired) {
    return "session_expired";
  }
  return "session_state_conflict";
}

export async function bumpSessionToUploading(sessionId: string): Promise<void> {
  const pool = getPool();
  await pool.query(
    `UPDATE media_upload_sessions SET status = 'uploading', updated_at = now()
      WHERE id = $1::uuid AND status = 'initiated'`,
    [sessionId],
  );
}

export type SessionWithMediaRow = {
  session_id: string;
  media_id: string;
  s3_key: string;
  upload_id: string;
  session_status: string;
  media_status: string;
};

export async function getUploadSessionWithMedia(
  sessionId: string,
  ownerUserId: string,
): Promise<SessionWithMediaRow | null> {
  const pool = getPool();
  const res = await pool.query<SessionWithMediaRow>(
    `SELECT s.id AS session_id, s.media_id, s.s3_key, s.upload_id, s.status AS session_status, m.status AS media_status
       FROM media_upload_sessions s
       JOIN media_files m ON m.id = s.media_id
      WHERE s.id = $1::uuid AND s.owner_user_id = $2::uuid`,
    [sessionId, ownerUserId],
  );
  return res.rows[0] ?? null;
}

export async function listExpiredActiveUploadSessions(limit: number): Promise<
  { id: string; media_id: string; s3_key: string; upload_id: string; owner_user_id: string }[]
> {
  const pool = getPool();
  const cap = Math.max(1, Math.min(50, limit));
  const res = await pool.query<{
    id: string;
    media_id: string;
    s3_key: string;
    upload_id: string;
    owner_user_id: string;
  }>(
    `SELECT id, media_id, s3_key, upload_id, owner_user_id
       FROM media_upload_sessions
      WHERE status IN ('initiated', 'uploading', 'completing')
        AND expires_at <= now()
      ORDER BY expires_at ASC
      LIMIT $1`,
    [cap],
  );
  return res.rows;
}

export async function markUploadSessionExpired(sessionId: string): Promise<void> {
  const pool = getPool();
  await pool.query(
    `UPDATE media_upload_sessions
        SET status = 'expired', updated_at = now(), last_error = 'expired'
      WHERE id = $1::uuid AND status IN ('initiated', 'uploading', 'completing')`,
    [sessionId],
  );
}
