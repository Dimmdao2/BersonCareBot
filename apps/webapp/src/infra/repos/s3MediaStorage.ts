import type { PoolClient } from "pg";
import { env } from "@/config/env";
import { getPool } from "@/infra/db/client";
import { logger } from "@/infra/logging/logger";
import {
  pgCreateFolder,
  pgDeleteFolderIfEmpty,
  pgListAllFolders,
  pgListFolders,
  pgMoveFolder,
  pgRenameFolder,
} from "@/infra/repos/mediaFoldersRepo";
import { s3DeleteObject, s3ObjectKey, s3PublicUrl, s3PutObjectBody } from "@/infra/s3/client";
import type { MediaStoragePort } from "@/modules/media/ports";
import { MAX_MEDIA_BYTES } from "@/modules/media/uploadAllowedMime";
import type { MediaListParams, MediaPreviewStatus, MediaRecord, MediaUsageRef } from "@/modules/media/types";
import { mediaPreviewUrlById } from "@/shared/lib/mediaPreviewUrls";
import { pgRuSubstringSearchPattern } from "@/shared/lib/ruSearchNormalize";

function mediaAppUrl(mediaId: string): string {
  return `/api/media/${mediaId}`;
}

/** Rows visible in library / readable by GET (not pending upload, not delete pipeline). */
export const MEDIA_READABLE_STATUS_SQL = `(status IS NULL OR status NOT IN ('pending', 'deleting', 'pending_delete'))`;
const MEDIA_READABLE_STATUS_SQL_M = `(m.status IS NULL OR m.status NOT IN ('pending', 'deleting', 'pending_delete'))`;

/** Rows queued for background S3 removal (includes legacy `deleting` from pre-queue implementation). */
const MEDIA_S3_PURGE_STATUS_SQL = `status IN ('pending_delete', 'deleting')`;

function kindFromMime(mimeType: string): MediaRecord["kind"] {
  const lower = mimeType.toLowerCase();
  if (lower.startsWith("image/")) return "image";
  if (lower.startsWith("audio/")) return "audio";
  if (lower.startsWith("video/")) return "video";
  return "file";
}

export function createS3MediaStoragePort(): MediaStoragePort {
  return {
    async upload(params) {
      const body =
        params.body instanceof ArrayBuffer
          ? params.body
          : new Uint8Array(params.body).buffer;
      if (body.byteLength > MAX_MEDIA_BYTES) {
        throw new Error("media_upload_too_large");
      }
      if (body.byteLength === 0) {
        throw new Error("media_upload_empty");
      }

      const pool = getPool();
      const idRow = await pool.query<{ id: string }>(`SELECT gen_random_uuid()::text AS id`);
      const id = idRow.rows[0]?.id;
      if (!id) throw new Error("media_upload_id");

      const key = s3ObjectKey(id, params.filename);
      const buf = Buffer.from(body);
      await s3PutObjectBody(key, buf, params.mimeType);

      const folderId = params.folderId ?? null;
      await pool.query(
        `INSERT INTO media_files (id, original_name, stored_path, s3_key, mime_type, size_bytes, status, uploaded_by, folder_id)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, 'ready', $7::uuid, $8::uuid)`,
        [id, params.filename, key, key, params.mimeType, body.byteLength, params.userId ?? null, folderId],
      );

      const now = new Date().toISOString();
      const record: MediaRecord = {
        id,
        kind: kindFromMime(params.mimeType),
        mimeType: params.mimeType,
        filename: params.filename,
        displayName: null,
        size: body.byteLength,
        userId: params.userId ?? null,
        folderId,
        createdAt: now,
      };
      return { record, url: mediaAppUrl(id) };
    },

    async getById(id: string) {
      const pool = getPool();
      const res = await pool.query<{
        id: string;
        original_name: string;
        display_name: string | null;
        mime_type: string;
        size_bytes: string;
        uploaded_by: string | null;
        uploaded_by_name: string | null;
        created_at: Date;
        preview_status: string | null;
        preview_sm_key: string | null;
        preview_md_key: string | null;
        source_width: number | null;
        source_height: number | null;
      }>(
        `SELECT m.id, m.original_name, m.display_name, m.mime_type, m.size_bytes, m.uploaded_by,
            COALESCE(
              NULLIF(TRIM(CONCAT_WS(' ', pu.first_name, pu.last_name)), ''),
              NULLIF(TRIM(pu.display_name), '')
            ) AS uploaded_by_name,
            m.created_at,
            m.preview_status, m.preview_sm_key, m.preview_md_key,
            m.source_width, m.source_height
         FROM media_files m
         LEFT JOIN platform_users pu ON pu.id = m.uploaded_by
         WHERE m.id = $1::uuid AND ${MEDIA_READABLE_STATUS_SQL_M}`,
        [id],
      );
      const row = res.rows[0];
      if (!row) return null;
      const previewStatus = (row.preview_status ?? "pending") as MediaPreviewStatus;
      return {
        id: row.id,
        kind: kindFromMime(row.mime_type),
        mimeType: row.mime_type,
        filename: row.original_name,
        displayName: row.display_name,
        size: parseInt(String(row.size_bytes), 10),
        userId: row.uploaded_by,
        uploadedByName: row.uploaded_by_name,
        createdAt: row.created_at.toISOString(),
        previewStatus,
        previewSmUrl: row.preview_sm_key?.trim() ? mediaPreviewUrlById(row.id, "sm") : null,
        previewMdUrl: row.preview_md_key?.trim() ? mediaPreviewUrlById(row.id, "md") : null,
        sourceWidth: row.source_width ?? null,
        sourceHeight: row.source_height ?? null,
      };
    },

    async getUrl(id: string) {
      const pool = getPool();
      const res = await pool.query<{ s3_key: string }>(
        `SELECT s3_key FROM media_files WHERE id = $1::uuid AND s3_key IS NOT NULL AND ${MEDIA_READABLE_STATUS_SQL}`,
        [id],
      );
      const row = res.rows[0];
      if (!row) return null;
      return mediaAppUrl(id);
    },

    async list(params: MediaListParams) {
      const pool = getPool();
      const where: string[] = [MEDIA_READABLE_STATUS_SQL_M];
      const values: unknown[] = [];
      let n = 1;

      if (params.kind && params.kind !== "all") {
        const byKind: Record<Exclude<MediaRecord["kind"], "file">, string> = {
          image: "m.mime_type LIKE 'image/%'",
          video: "m.mime_type LIKE 'video/%'",
          audio: "m.mime_type LIKE 'audio/%'",
        };
        if (params.kind === "file") {
          where.push(
            `NOT (m.mime_type LIKE 'image/%' OR m.mime_type LIKE 'video/%' OR m.mime_type LIKE 'audio/%')`,
          );
        } else {
          where.push(byKind[params.kind]);
        }
      }

      const pattern = params.query ? pgRuSubstringSearchPattern(params.query) : null;
      if (pattern) {
        where.push(
          `(normalize(m.display_name, NFC) ILIKE $${n} ESCAPE '\\' OR normalize(m.original_name, NFC) ILIKE $${n} ESCAPE '\\')`,
        );
        values.push(pattern);
        n += 1;
      }

      if (params.folderId !== undefined) {
        if (params.folderId === null) {
          where.push(`m.folder_id IS NULL`);
        } else if (params.includeDescendants) {
          where.push(
            `m.folder_id IN (
              WITH RECURSIVE sub AS (
                SELECT id FROM media_folders WHERE id = $${n}::uuid
                UNION ALL
                SELECT f.id FROM media_folders f INNER JOIN sub ON f.parent_id = sub.id
              )
              SELECT id FROM sub
            )`,
          );
          values.push(params.folderId);
          n += 1;
        } else {
          where.push(`m.folder_id = $${n}::uuid`);
          values.push(params.folderId);
          n += 1;
        }
      }

      const sortCol: Record<NonNullable<MediaListParams["sortBy"]>, string> = {
        createdAt: "m.created_at",
        size: "m.size_bytes",
        kind: "m.mime_type",
        name: "LOWER(COALESCE(NULLIF(TRIM(m.display_name), ''), m.original_name))",
      };
      const sortBy = params.sortBy ? sortCol[params.sortBy] : "m.created_at";
      const sortDir = params.sortDir === "asc" ? "ASC" : "DESC";
      const limit = Math.max(1, Math.min(200, params.limit ?? 50));
      const offset = Math.max(0, params.offset ?? 0);

      values.push(limit, offset);
      const limitIdx = n++;
      const offsetIdx = n++;

      const whereSql = `WHERE ${where.join(" AND ")}`;
      const res = await pool.query<{
        id: string;
        original_name: string;
        display_name: string | null;
        mime_type: string;
        size_bytes: number | string;
        uploaded_by: string | null;
        uploaded_by_name: string | null;
        created_at: Date;
        s3_key: string;
        folder_id: string | null;
        preview_status: string | null;
        preview_sm_key: string | null;
        preview_md_key: string | null;
        source_width: number | null;
        source_height: number | null;
      }>(
        `SELECT m.id, m.original_name, m.display_name, m.mime_type, m.size_bytes, m.uploaded_by,
            COALESCE(
              NULLIF(TRIM(CONCAT_WS(' ', pu.first_name, pu.last_name)), ''),
              NULLIF(TRIM(pu.display_name), '')
            ) AS uploaded_by_name,
            m.created_at, m.s3_key, m.folder_id,
            m.preview_status, m.preview_sm_key, m.preview_md_key,
            m.source_width, m.source_height
         FROM media_files m
         LEFT JOIN platform_users pu ON pu.id = m.uploaded_by
         ${whereSql} AND m.s3_key IS NOT NULL
         ORDER BY ${sortBy} ${sortDir}, m.id ${sortDir}
         LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        values,
      );

      return res.rows.map((row) => {
        const previewStatus = (row.preview_status ?? "pending") as MediaPreviewStatus;
        return {
          id: row.id,
          kind: kindFromMime(row.mime_type),
          mimeType: row.mime_type,
          filename: row.original_name,
          displayName: row.display_name,
          size: Number(row.size_bytes),
          userId: row.uploaded_by,
          uploadedByName: row.uploaded_by_name,
          createdAt: row.created_at.toISOString(),
          folderId: row.folder_id,
          url: mediaAppUrl(row.id),
          previewStatus,
          previewSmUrl: row.preview_sm_key?.trim() ? mediaPreviewUrlById(row.id, "sm") : null,
          previewMdUrl: row.preview_md_key?.trim() ? mediaPreviewUrlById(row.id, "md") : null,
          sourceWidth: row.source_width ?? null,
          sourceHeight: row.source_height ?? null,
        };
      });
    },

    async updateDisplayName(mediaId: string, displayName: string | null) {
      const pool = getPool();
      const normalized = displayName?.trim() || null;
      const res = await pool.query(
        `UPDATE media_files m
            SET display_name = $2
          WHERE m.id = $1::uuid AND ${MEDIA_READABLE_STATUS_SQL_M}`,
        [mediaId, normalized],
      );
      return (res.rowCount ?? 0) > 0;
    },

    async updateMediaFolder(mediaId: string, folderId: string | null) {
      const pool = getPool();
      const res = await pool.query(
        `UPDATE media_files m
            SET folder_id = $2
          WHERE m.id = $1::uuid AND ${MEDIA_READABLE_STATUS_SQL_M}`,
        [mediaId, folderId],
      );
      return (res.rowCount ?? 0) > 0;
    },

    async listFolders(parentId: string | null) {
      return pgListFolders(parentId);
    },

    async listAllFolders() {
      return pgListAllFolders();
    },

    async createFolder(params: { name: string; parentId: string | null; createdBy: string }) {
      return pgCreateFolder(params);
    },

    async renameFolder(folderId: string, name: string) {
      return pgRenameFolder(folderId, name);
    },

    async moveFolder(folderId: string, newParentId: string | null) {
      return pgMoveFolder(folderId, newParentId);
    },

    async deleteFolder(folderId: string) {
      return pgDeleteFolderIfEmpty(folderId);
    },

    async findUsage(mediaId: string): Promise<MediaUsageRef[]> {
      const pool = getPool();
      const mediaUrl = `/api/media/${mediaId}`;
      const keyRes = await pool.query<{ s3_key: string | null }>(
        `SELECT s3_key FROM media_files WHERE id = $1::uuid`,
        [mediaId],
      );
      const s3Key = keyRes.rows[0]?.s3_key ?? null;
      const publicUrl =
        s3Key && env.S3_PUBLIC_BUCKET ? s3PublicUrl(s3Key) : null;

      const res = await pool.query<MediaUsageRef>(
        `SELECT id::text AS "pageId", slug AS "pageSlug", 'image_url'::text AS field
           FROM content_pages
          WHERE image_url = $1 OR ($2::text IS NOT NULL AND image_url = $2)
         UNION ALL
         SELECT id::text AS "pageId", slug AS "pageSlug", 'video_url'::text AS field
           FROM content_pages
          WHERE video_url = $1 OR ($2::text IS NOT NULL AND video_url = $2)
              OR (video_type = 'api' AND video_url = $3)
         UNION ALL
         SELECT id::text AS "pageId", slug AS "pageSlug", 'body_md'::text AS field
           FROM content_pages
          WHERE body_md LIKE $4 OR ($5::text IS NOT NULL AND body_md LIKE $5)
         UNION ALL
         SELECT id::text AS "pageId", slug AS "pageSlug", 'body_html'::text AS field
           FROM content_pages
          WHERE body_html LIKE $4 OR ($5::text IS NOT NULL AND body_html LIKE $5)`,
        [
          mediaUrl,
          publicUrl,
          mediaId,
          `%${mediaUrl}%`,
          publicUrl ? `%${publicUrl}%` : null,
        ],
      );
      return res.rows.map((row) => ({
        pageId: row.pageId,
        pageSlug: row.pageSlug,
        field: row.field,
      }));
    },

    async deleteHard(mediaId: string) {
      const pool = getPool();
      await pool.query(`SELECT pg_advisory_lock(hashtext($1))`, [mediaId]);
      try {
        const sel = await pool.query<{ s3_key: string | null; status: string | null }>(
          `SELECT s3_key, status FROM media_files WHERE id = $1::uuid`,
          [mediaId],
        );
        const row = sel.rows[0];
        if (!row) return false;

        if (row.status === "pending_delete") {
          return true;
        }

        if (!row.s3_key) {
          const del = await pool.query(`DELETE FROM media_files WHERE id = $1::uuid`, [mediaId]);
          return (del.rowCount ?? 0) > 0;
        }

        await pool.query(`UPDATE media_files SET status = 'pending_delete' WHERE id = $1::uuid`, [mediaId]);
        return true;
      } finally {
        await pool.query(`SELECT pg_advisory_unlock(hashtext($1))`, [mediaId]);
      }
    },
  };
}

/** Insert pending row inside caller's transaction (e.g. shared user lifecycle lock + presign). */
export async function insertPendingMediaFileTx(
  client: PoolClient,
  params: {
    id: string;
    filename: string;
    key: string;
    mimeType: string;
    sizeBytes: number;
    userId: string;
    folderId?: string | null;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO media_files (id, original_name, stored_path, s3_key, mime_type, size_bytes, status, uploaded_by, folder_id)
     VALUES ($1::uuid, $2, $3, $4, $5, $6, 'pending', $7::uuid, $8::uuid)`,
    [
      params.id,
      params.filename,
      params.key,
      params.key,
      params.mimeType,
      params.sizeBytes,
      params.userId,
      params.folderId ?? null,
    ],
  );
}

/** Insert pending row + return presign target (presign route). */
export async function insertPendingMediaFile(params: {
  id: string;
  filename: string;
  key: string;
  mimeType: string;
  sizeBytes: number;
  userId: string;
  folderId?: string | null;
}): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO media_files (id, original_name, stored_path, s3_key, mime_type, size_bytes, status, uploaded_by, folder_id)
     VALUES ($1::uuid, $2, $3, $4, $5, $6, 'pending', $7::uuid, $8::uuid)`,
    [
      params.id,
      params.filename,
      params.key,
      params.key,
      params.mimeType,
      params.sizeBytes,
      params.userId,
      params.folderId ?? null,
    ],
  );
}

/** Row for confirm flow: same owner, any status (pending or ready for idempotency). */
export async function getMediaRowForConfirm(
  mediaId: string,
  userId: string,
): Promise<{ s3_key: string | null; status: string } | null> {
  const pool = getPool();
  const res = await pool.query<{ s3_key: string | null; status: string }>(
    `SELECT s3_key, status FROM media_files WHERE id = $1::uuid AND uploaded_by = $2::uuid`,
    [mediaId, userId],
  );
  return res.rows[0] ?? null;
}

export async function confirmMediaFileReady(mediaId: string): Promise<boolean> {
  const pool = getPool();
  const res = await pool.query(`UPDATE media_files SET status = 'ready' WHERE id = $1::uuid AND status = 'pending'`, [
    mediaId,
  ]);
  return (res.rowCount ?? 0) > 0;
}

/** Roll back presign INSERT when presigned URL generation fails. */
export async function deletePendingMediaFileById(mediaId: string): Promise<boolean> {
  const pool = getPool();
  const res = await pool.query(`DELETE FROM media_files WHERE id = $1::uuid AND status = 'pending'`, [mediaId]);
  return (res.rowCount ?? 0) > 0;
}

export type MediaDeleteErrorRow = {
  id: string;
  original_name: string;
  delete_attempts: number;
  next_attempt_at: string | null;
  created_at: string;
};

/** Admin: rows stuck in delete queue with at least one failed S3 attempt. */
export async function listMediaDeleteErrors(limit: number = 100): Promise<{ items: MediaDeleteErrorRow[]; total: number }> {
  const pool = getPool();
  const cap = Math.min(100, Math.max(1, limit));
  const countRes = await pool.query<{ c: string }>(
    `SELECT count(*)::text AS c FROM media_files
     WHERE status IN ('pending_delete', 'deleting') AND COALESCE(delete_attempts, 0) > 0`,
  );
  const total = Number.parseInt(countRes.rows[0]?.c ?? "0", 10);
  const res = await pool.query<MediaDeleteErrorRow>(
    `SELECT id::text, original_name, COALESCE(delete_attempts, 0)::int AS delete_attempts,
            next_attempt_at::text, created_at::text
       FROM media_files
      WHERE status IN ('pending_delete', 'deleting') AND COALESCE(delete_attempts, 0) > 0
      ORDER BY delete_attempts DESC, id ASC
      LIMIT $1`,
    [cap],
  );
  return { items: res.rows, total };
}

/** For GET /api/media/[id]: S3 key when row may be redirected (presigned GET to private bucket). */
export async function getMediaS3KeyForRedirect(id: string): Promise<string | null> {
  const pool = getPool();
  const res = await pool.query<{ s3_key: string | null }>(
    `SELECT s3_key FROM media_files WHERE id = $1::uuid AND s3_key IS NOT NULL AND ${MEDIA_READABLE_STATUS_SQL}`,
    [id],
  );
  return res.rows[0]?.s3_key ?? null;
}

/** Presigned-GET target for generated preview JPEG (sm/md). */
export async function getMediaPreviewS3KeyForRedirect(
  id: string,
  size: "sm" | "md",
): Promise<string | null> {
  const pool = getPool();
  const res = await pool.query<{
    preview_sm_key: string | null;
    preview_md_key: string | null;
    preview_status: string | null;
  }>(
    `SELECT preview_sm_key, preview_md_key, preview_status
     FROM media_files
     WHERE id = $1::uuid AND ${MEDIA_READABLE_STATUS_SQL}`,
    [id],
  );
  const row = res.rows[0];
  if (!row || row.preview_status !== "ready") return null;
  const key = size === "sm" ? row.preview_sm_key : row.preview_md_key;
  return key?.trim() ? key : null;
}

export type PurgePendingMediaDeleteBatchResult = {
  /** Rows fully removed (S3 delete + DB delete, or orphan cleanup). */
  removed: number;
  /** Rows where S3 delete failed in this run (retry scheduled). */
  errors: number;
};

/**
 * Background worker: delete S3 objects and DB rows for media in `pending_delete` or stuck `deleting`.
 * On S3 failure: increments `delete_attempts`, sets `next_attempt_at` with exponential backoff (cap 1 day).
 */
export async function purgePendingMediaDeleteBatch(
  limit: number = 25,
): Promise<PurgePendingMediaDeleteBatchResult> {
  const pool = getPool();
  const take = Math.max(1, Math.min(50, limit));
  let removed = 0;
  let errors = 0;

  for (let i = 0; i < take; i++) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query<{
        id: string;
        s3_key: string;
        preview_sm_key: string | null;
        preview_md_key: string | null;
        status: string | null;
        delete_attempts: number | null;
      }>(
        `SELECT id, s3_key, preview_sm_key, preview_md_key, status, COALESCE(delete_attempts, 0) AS delete_attempts
         FROM media_files
         WHERE ${MEDIA_S3_PURGE_STATUS_SQL} AND s3_key IS NOT NULL AND length(trim(s3_key)) > 0
         AND (next_attempt_at IS NULL OR next_attempt_at <= now())
         ORDER BY id ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED`,
      );
      if (rows.length === 0) {
        await client.query("COMMIT");
        break;
      }

      const row = rows[0]!;
      if (row.status !== "pending_delete" && row.status !== "deleting") {
        await client.query("ROLLBACK");
        continue;
      }

      const keysToDelete = [row.preview_sm_key, row.preview_md_key, row.s3_key].filter(
        (k): k is string => Boolean(k && k.trim()),
      );
      try {
        for (const key of keysToDelete) {
          await s3DeleteObject(key);
        }
      } catch (e) {
        const prevAttempts = row.delete_attempts ?? 0;
        const exp = Math.min(prevAttempts + 1, 20);
        const minutes = Math.min(1440, Math.pow(2, exp));
        await client.query(
          `UPDATE media_files SET
             delete_attempts = delete_attempts + 1,
             next_attempt_at = now() + ($2::numeric * interval '1 minute')
           WHERE id = $1::uuid`,
          [row.id, minutes],
        );
        await client.query("COMMIT");
        errors += 1;
        logger.error({ err: e, mediaId: row.id }, "[purgePendingMediaDeleteBatch] s3 delete failed");
        continue;
      }

      const del = await client.query(
        `DELETE FROM media_files WHERE id = $1::uuid AND ${MEDIA_S3_PURGE_STATUS_SQL}`,
        [row.id],
      );
      await client.query("COMMIT");
      if ((del.rowCount ?? 0) > 0) removed += 1;
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

  const orphan = await pool.query(
    `DELETE FROM media_files WHERE ${MEDIA_S3_PURGE_STATUS_SQL} AND (s3_key IS NULL OR trim(s3_key) = '')`,
  );
  removed += orphan.rowCount ?? 0;

  return { removed, errors };
}
