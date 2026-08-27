import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Pool, PoolClient } from 'pg';
import { getPool } from '@/infra/db/client';
import { getWebappSqlDb, getWebappSqlFromPgClient, runWebappSql } from '@/infra/db/runWebappSql';
import { withPoolTransaction } from '@/infra/db/withClient';
import { mediaFiles, mediaUploadSessions } from '../../../db/schema/schema';
import { assertReceivedUpload, type ReceivedUpload } from '@/modules/media/uploadValidation';
import { getCurrentDbPrincipalOrganizationId } from '@bersoncare/db-principal';

export type UploadSessionRow = {
  id: string;
  media_id: string;
  s3_key: string;
  upload_id: string;
  owner_user_id: string;
  status: string;
  expected_size_bytes: string;
  mime_type: string;
  original_name: string;
  part_size_bytes: number;
  expires_at: Date;
};

export type FinalizeMultipartResult = {
  sessionRows: number;
  mediaRows: number;
};

export type AbortMultipartDbResult =
  | { ok: 'aborted'; s3Key: string; uploadId: string }
  | { ok: 'already_completed' }
  | { ok: 'already_final' }
  | { ok: 'not_found' };

const uploadSessionReturning = sql`
  s.id, s.media_id, s.s3_key, s.upload_id, s.owner_user_id, s.status,
  s.expected_size_bytes::text, s.mime_type, m.original_name, s.part_size_bytes, s.expires_at
`;

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
  const organizationId = getCurrentDbPrincipalOrganizationId();
  if (!organizationId) throw new Error('organization_principal_required');
  const db = getWebappSqlFromPgClient(client);
  await db.insert(mediaUploadSessions).values({
    organizationId,
    id: params.sessionId,
    mediaId: params.mediaId,
    s3Key: params.s3Key,
    uploadId: params.uploadId,
    ownerUserId: params.ownerUserId,
    status: 'initiated',
    expectedSizeBytes: params.expectedSizeBytes,
    mimeType: params.mimeType,
    partSizeBytes: params.partSizeBytes,
    expiresAt: params.expiresAt.toISOString(),
  });
}

/** Lock session for complete: initiated|uploading -> completing. Returns row or null. */
export async function claimUploadSessionForCompletingTx(
  client: PoolClient,
  sessionId: string,
  ownerUserId: string,
  organizationId: string,
): Promise<UploadSessionRow | null> {
  const db = getWebappSqlFromPgClient(client);
  const res = await runWebappSql<UploadSessionRow>(
    db,
    sql`UPDATE media_upload_sessions s
        SET status = 'completing', updated_at = now()
      FROM media_files m
      WHERE s.id = ${sessionId}::uuid
        AND s.media_id = m.id
        AND s.owner_user_id = ${ownerUserId}::uuid
        AND m.organization_id = ${organizationId}::uuid
        AND s.status IN ('initiated', 'uploading')
        AND s.expires_at > now()
      RETURNING ${uploadSessionReturning}`,
  );
  return res.rows[0] ?? null;
}

/** Pool-level claim (legacy callers / tests). Prefer claimUploadSessionForCompletingTx + multipart lock. */
export async function claimUploadSessionForCompleting(
  sessionId: string,
  ownerUserId: string,
  organizationId: string,
): Promise<UploadSessionRow | null> {
  const pool = getPool();
  return withPoolTransaction(pool, async (client) => {
    const row = await claimUploadSessionForCompletingTx(
      client,
      sessionId,
      ownerUserId,
      organizationId,
    );
    return row;
  });
}

/** Retry path: session already in completing (e.g. prior request died after S3 Complete). */
export async function getCompletingSessionTx(
  client: PoolClient,
  sessionId: string,
  ownerUserId: string,
  organizationId: string,
): Promise<UploadSessionRow | null> {
  const db = getWebappSqlFromPgClient(client);
  const res = await runWebappSql<UploadSessionRow>(
    db,
    sql`SELECT ${uploadSessionReturning}
       FROM media_upload_sessions s
       JOIN media_files m ON m.id = s.media_id
      WHERE s.id = ${sessionId}::uuid
        AND s.owner_user_id = ${ownerUserId}::uuid
        AND m.organization_id = ${organizationId}::uuid
        AND s.status = 'completing'
        AND s.expires_at > now()`,
  );
  return res.rows[0] ?? null;
}

/** Mark completing -> failed (single transition; no revert + failed double-write). */
export async function markCompletingSessionFailedTx(
  client: PoolClient,
  sessionId: string,
  organizationId: string,
  message: string,
): Promise<boolean> {
  const db = getWebappSqlFromPgClient(client);
  const res = await runWebappSql(
    db,
    sql`UPDATE media_upload_sessions s
        SET status = 'failed', last_error = ${message.slice(0, 2000)}, updated_at = now()
      FROM media_files m
      WHERE s.id = ${sessionId}::uuid
        AND s.media_id = m.id
        AND m.organization_id = ${organizationId}::uuid
        AND s.status = 'completing'`,
  );
  return (res.rowCount ?? 0) > 0;
}

export async function finalizeMultipartSuccessTx(
  client: PoolClient,
  sessionId: string,
  mediaId: string,
  ownerUserId: string,
  organizationId: string,
  received: ReceivedUpload,
): Promise<FinalizeMultipartResult> {
  assertReceivedUpload(received);
  const db = getWebappSqlFromPgClient(client);
  const sessionRes = await runWebappSql(
    db,
    sql`UPDATE media_upload_sessions s
        SET status = 'completed', completed_at = now(), updated_at = now()
      FROM media_files m
      WHERE s.id = ${sessionId}::uuid
        AND s.media_id = ${mediaId}::uuid
        AND s.media_id = m.id
        AND s.owner_user_id = ${ownerUserId}::uuid
        AND m.organization_id = ${organizationId}::uuid
        AND s.status = 'completing'`,
  );
  const mediaRes = await runWebappSql(
    db,
    sql`UPDATE media_files SET status = 'ready'
      WHERE id = ${mediaId}::uuid
        AND organization_id = ${organizationId}::uuid
        AND status = 'pending'`,
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
  organizationId: string,
  received: ReceivedUpload,
): Promise<{ kind: 'finalized' | 'already_done' | 'partial'; result: FinalizeMultipartResult }> {
  assertReceivedUpload(received);
  const db = getWebappSqlFromPgClient(client);
  const state = await runWebappSql<{ s: string; m: string }>(
    db,
    sql`SELECT s.status AS s, m.status AS m
       FROM media_upload_sessions s
       JOIN media_files m ON m.id = s.media_id
      WHERE s.id = ${sessionId}::uuid
        AND s.media_id = ${mediaId}::uuid
        AND s.owner_user_id = ${ownerUserId}::uuid
        AND m.organization_id = ${organizationId}::uuid`,
  );
  const row = state.rows[0];
  if (!row) {
    return { kind: 'partial', result: { sessionRows: 0, mediaRows: 0 } };
  }
  if (row.s === 'completed' && row.m === 'ready') {
    return { kind: 'already_done', result: { sessionRows: 0, mediaRows: 0 } };
  }
  const result = await finalizeMultipartSuccessTx(
    client,
    sessionId,
    mediaId,
    ownerUserId,
    organizationId,
    received,
  );
  if (result.sessionRows > 0 && result.mediaRows > 0) {
    return { kind: 'finalized', result };
  }
  return { kind: 'partial', result };
}

/**
 * Abort user upload: under row locks, delete pending media (cascade removes session) or detect terminal states.
 * Caller should run S3 AbortMultipartUpload after commit using returned keys when ok === "aborted".
 */
export async function abortMultipartPendingTx(
  client: PoolClient,
  sessionId: string,
  ownerUserId: string,
  organizationId: string,
): Promise<AbortMultipartDbResult> {
  const db = getWebappSqlFromPgClient(client);
  const sel = await runWebappSql<SessionWithMediaRow>(
    db,
    sql`SELECT s.id AS session_id, s.media_id, s.s3_key, s.upload_id, s.status AS session_status, m.status AS media_status
       FROM media_upload_sessions s
       INNER JOIN media_files m ON m.id = s.media_id
      WHERE s.id = ${sessionId}::uuid
        AND s.owner_user_id = ${ownerUserId}::uuid
        AND m.organization_id = ${organizationId}::uuid
      FOR UPDATE OF s, m`,
  );
  const row = sel.rows[0];
  if (!row) {
    return { ok: 'not_found' };
  }

  if (row.media_status === 'ready') {
    return { ok: 'already_completed' };
  }

  if (['aborted', 'expired', 'failed', 'completed'].includes(row.session_status)) {
    return { ok: 'already_final' };
  }

  const del = await runWebappSql(
    db,
    sql`DELETE FROM media_files WHERE id = ${row.media_id}::uuid AND status = 'pending'`,
  );
  if ((del.rowCount ?? 0) === 0) {
    const again = await runWebappSql<{ m: string | null }>(
      db,
      sql`SELECT m.status AS m
         FROM media_upload_sessions s
         LEFT JOIN media_files m ON m.id = s.media_id
        WHERE s.id = ${sessionId}::uuid`,
    );
    const ms = again.rows[0]?.m;
    if (ms === 'ready') {
      return { ok: 'already_completed' };
    }
    return { ok: 'not_found' };
  }

  return { ok: 'aborted', s3Key: row.s3_key, uploadId: row.upload_id };
}

export async function markUploadSessionExpiredTx(
  client: PoolClient,
  sessionId: string,
): Promise<void> {
  const db = getWebappSqlFromPgClient(client);
  await runWebappSql(
    db,
    sql`UPDATE media_upload_sessions
        SET status = 'expired', updated_at = now(), last_error = 'expired'
      WHERE id = ${sessionId}::uuid AND status IN ('initiated', 'uploading', 'completing')`,
  );
}

/** Expired session row locked for internal cleanup cron. */
export async function lockExpiredSessionForCleanupTx(
  client: PoolClient,
  sessionId: string,
): Promise<{ id: string; media_id: string; s3_key: string; upload_id: string } | null> {
  const db = getWebappSqlFromPgClient(client);
  const res = await runWebappSql<{
    id: string;
    media_id: string;
    s3_key: string;
    upload_id: string;
  }>(
    db,
    sql`SELECT id, media_id, s3_key, upload_id
       FROM media_upload_sessions
      WHERE id = ${sessionId}::uuid
        AND status IN ('initiated', 'uploading', 'completing')
        AND expires_at <= now()
      FOR UPDATE`,
  );
  return res.rows[0] ?? null;
}

export type ExpiredMultipartStageOutcome = 'staged' | 'session_only' | 'skipped';

/**
 * Audit §D1 / stage 4. Hands an EXPIRED multipart session to the ONE cleanup state machine the
 * repository already has (`media_files.status = 'pending_delete'` + `delete_attempts` /
 * `next_attempt_at`, drained by `purgePendingMediaDeleteBatch`), instead of deleting the media row
 * here and firing a best-effort `AbortMultipartUpload` afterwards.
 *
 * Why this ordering matters: `media_upload_sessions` is the only holder of the S3 retry identity
 * (`s3_key` + `upload_id`), and it cascade-dies with its `media_files` row. Deleting the media row
 * first and aborting second means a failed abort can never be retried — the parts stay in the bucket
 * with nothing left in the database that names them. Here the session row is only moved to
 * `expired` (so the cleanup selector stops re-picking it) and SURVIVES; the media row is deleted by
 * the purge batch only after the abort is confirmed.
 *
 * - `staged`      — session expired, media row handed to the pending-delete lifecycle;
 * - `session_only`— media was no longer `pending` (upload finished): session closed, nothing to purge;
 * - `skipped`     — the session was claimed or finished by someone else in the meantime.
 */
export async function stageExpiredMultipartSessionForPurgeTx(
  client: PoolClient,
  sessionId: string,
): Promise<ExpiredMultipartStageOutcome> {
  const session = await lockExpiredSessionForCleanupTx(client, sessionId);
  if (!session) return 'skipped';

  const db = getWebappSqlFromPgClient(client);
  const staged = await runWebappSql(
    db,
    sql`UPDATE media_files
        SET status = 'pending_delete', next_attempt_at = now()
      WHERE id = ${session.media_id}::uuid AND status = 'pending'`,
  );
  // The session row itself is kept: it carries `s3_key` + `upload_id`, the only way to abort the
  // multipart upload. `expired` just takes it out of the active-session selector.
  await markUploadSessionExpiredTx(client, session.id);

  if ((staged.rowCount ?? 0) === 0) return 'session_only';

  // Same treatment as the user-initiated abort (`stagePendingMediaAbort`): metadata for a file that
  // never arrived must not outlive the upload it describes.
  await runWebappSql(
    db,
    sql`DELETE FROM patient_files WHERE media_file_id = ${session.media_id}::uuid`,
  );
  return 'staged';
}

/** Delete pending media row inside caller transaction (multipart cleanup). */
export async function deletePendingMediaFileTx(
  client: PoolClient,
  mediaId: string,
): Promise<number> {
  const db = getWebappSqlFromPgClient(client);
  const res = await runWebappSql(
    db,
    sql`DELETE FROM media_files WHERE id = ${mediaId}::uuid AND status = 'pending'`,
  );
  return res.rowCount ?? 0;
}

export async function markUploadSessionFailed(sessionId: string, message: string): Promise<void> {
  const db = getWebappSqlDb();
  await db
    .update(mediaUploadSessions)
    .set({
      status: 'failed',
      lastError: message.slice(0, 2000),
      updatedAt: sql`now()`,
    })
    .where(eq(mediaUploadSessions.id, sessionId));
}

export type GatePartUrlResult =
  | { ok: true; row: UploadSessionRow }
  | { ok: false; error: 'session_not_found' | 'session_expired' | 'session_state_conflict' };

/** Distinguish missing session vs TTL vs wrong status for part-url (and clearer client errors). */
export async function gateUploadSessionForPartUrl(
  sessionId: string,
  ownerUserId: string,
  organizationId: string,
): Promise<GatePartUrlResult> {
  const res = await runWebappSql<UploadSessionRow & { expired: boolean }>(
    getWebappSqlDb(),
    sql`SELECT s.id, s.media_id, s.s3_key, s.upload_id, s.owner_user_id, s.status,
            s.expected_size_bytes::text, s.mime_type, m.original_name, s.part_size_bytes, s.expires_at,
            (expires_at <= now()) AS expired
       FROM media_upload_sessions s
       JOIN media_files m ON m.id = s.media_id
      WHERE s.id = ${sessionId}::uuid
        AND s.owner_user_id = ${ownerUserId}::uuid
        AND m.organization_id = ${organizationId}::uuid`,
  );
  const raw = res.rows[0];
  if (!raw) {
    return { ok: false, error: 'session_not_found' };
  }
  const { expired, ...row } = raw;
  if (expired) {
    return { ok: false, error: 'session_expired' };
  }
  if (row.status !== 'initiated' && row.status !== 'uploading') {
    return { ok: false, error: 'session_state_conflict' };
  }
  return { ok: true, row };
}

export type MultipartCompleteRejectError =
  | 'session_not_found'
  | 'session_expired'
  | 'session_state_conflict';

/**
 * When claim + completing-retry both miss, explain why (for POST multipart/complete).
 */
export async function classifyMultipartCompleteRejection(
  _pool: Pool,
  sessionId: string,
  ownerUserId: string,
  organizationId: string,
): Promise<MultipartCompleteRejectError> {
  const res = await runWebappSql<{ status: string; expired: boolean }>(
    getWebappSqlDb(),
    sql`SELECT status,
            (expires_at <= now()) AS expired
       FROM media_upload_sessions s
       JOIN media_files m ON m.id = s.media_id
      WHERE s.id = ${sessionId}::uuid
        AND s.owner_user_id = ${ownerUserId}::uuid
        AND m.organization_id = ${organizationId}::uuid`,
  );
  const row = res.rows[0];
  if (!row) {
    return 'session_not_found';
  }
  if (row.expired) {
    return 'session_expired';
  }
  return 'session_state_conflict';
}

export async function bumpSessionToUploading(sessionId: string): Promise<void> {
  const db = getWebappSqlDb();
  await db
    .update(mediaUploadSessions)
    .set({ status: 'uploading', updatedAt: sql`now()` })
    .where(and(eq(mediaUploadSessions.id, sessionId), eq(mediaUploadSessions.status, 'initiated')));
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
  const res = await runWebappSql<SessionWithMediaRow>(
    getWebappSqlDb(),
    sql`SELECT s.id AS session_id, s.media_id, s.s3_key, s.upload_id, s.status AS session_status, m.status AS media_status
       FROM media_upload_sessions s
       JOIN media_files m ON m.id = s.media_id
      WHERE s.id = ${sessionId}::uuid AND s.owner_user_id = ${ownerUserId}::uuid`,
  );
  return res.rows[0] ?? null;
}

export async function listExpiredActiveUploadSessions(
  limit: number,
): Promise<
  { id: string; media_id: string; s3_key: string; upload_id: string; owner_user_id: string }[]
> {
  const cap = Math.max(1, Math.min(50, limit));
  const res = await runWebappSql<{
    id: string;
    media_id: string;
    s3_key: string;
    upload_id: string;
    owner_user_id: string;
  }>(
    getWebappSqlDb(),
    sql`SELECT id, media_id, s3_key, upload_id, owner_user_id
       FROM media_upload_sessions
      WHERE status IN ('initiated', 'uploading', 'completing')
        AND expires_at <= now()
      ORDER BY expires_at ASC
      LIMIT ${cap}`,
  );
  return res.rows;
}

export async function markUploadSessionExpired(sessionId: string): Promise<void> {
  const db = getWebappSqlDb();
  await db
    .update(mediaUploadSessions)
    .set({
      status: 'expired',
      lastError: 'expired',
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(mediaUploadSessions.id, sessionId),
        inArray(mediaUploadSessions.status, ['initiated', 'uploading', 'completing']),
      ),
    );
}
