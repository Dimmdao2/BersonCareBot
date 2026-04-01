import { getPool } from "@/infra/db/client";
import {
  s3DeleteObject,
  s3ObjectKey,
  s3PublicUrl,
  s3PutObjectBody,
} from "@/infra/s3/client";
import type { MediaStoragePort } from "@/modules/media/ports";
import { MAX_MEDIA_BYTES } from "@/modules/media/uploadAllowedMime";
import type { MediaListParams, MediaRecord, MediaUsageRef } from "@/modules/media/types";

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

      await pool.query(
        `INSERT INTO media_files (id, original_name, stored_path, s3_key, mime_type, size_bytes, status, uploaded_by)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, 'ready', $7::uuid)`,
        [id, params.filename, key, key, params.mimeType, body.byteLength, params.userId ?? null],
      );

      const now = new Date().toISOString();
      const record: MediaRecord = {
        id,
        kind: kindFromMime(params.mimeType),
        mimeType: params.mimeType,
        filename: params.filename,
        size: body.byteLength,
        userId: params.userId ?? null,
        createdAt: now,
      };
      return { record, url: s3PublicUrl(key) };
    },

    async getById(id: string) {
      const pool = getPool();
      const res = await pool.query<{
        id: string;
        original_name: string;
        mime_type: string;
        size_bytes: string;
        uploaded_by: string | null;
        created_at: Date;
      }>(
        `SELECT id, original_name, mime_type, size_bytes, uploaded_by, created_at
         FROM media_files WHERE id = $1::uuid AND (status IS NULL OR status NOT IN ('pending', 'deleting'))`,
        [id],
      );
      const row = res.rows[0];
      if (!row) return null;
      return {
        id: row.id,
        kind: kindFromMime(row.mime_type),
        mimeType: row.mime_type,
        filename: row.original_name,
        size: parseInt(row.size_bytes, 10),
        userId: row.uploaded_by,
        createdAt: row.created_at.toISOString(),
      };
    },

    async getUrl(id: string) {
      const pool = getPool();
      const res = await pool.query<{ s3_key: string }>(
        `SELECT s3_key FROM media_files WHERE id = $1::uuid AND s3_key IS NOT NULL AND (status IS NULL OR status NOT IN ('pending', 'deleting'))`,
        [id],
      );
      const row = res.rows[0];
      if (!row) return null;
      return s3PublicUrl(row.s3_key);
    },

    async list(params: MediaListParams) {
      const pool = getPool();
      const where: string[] = [`(status IS NULL OR status NOT IN ('pending', 'deleting'))`];
      const values: unknown[] = [];
      let n = 1;

      if (params.kind && params.kind !== "all") {
        const byKind: Record<Exclude<MediaRecord["kind"], "file">, string> = {
          image: "mime_type LIKE 'image/%'",
          video: "mime_type LIKE 'video/%'",
          audio: "mime_type LIKE 'audio/%'",
        };
        if (params.kind === "file") {
          where.push(
            `NOT (mime_type LIKE 'image/%' OR mime_type LIKE 'video/%' OR mime_type LIKE 'audio/%')`,
          );
        } else {
          where.push(byKind[params.kind]);
        }
      }

      const q = params.query?.trim();
      if (q) {
        where.push(`original_name ILIKE $${n++}`);
        values.push(`%${q}%`);
      }

      const sortCol: Record<NonNullable<MediaListParams["sortBy"]>, string> = {
        createdAt: "created_at",
        size: "size_bytes",
        kind: "mime_type",
      };
      const sortBy = params.sortBy ? sortCol[params.sortBy] : "created_at";
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
        mime_type: string;
        size_bytes: number | string;
        uploaded_by: string | null;
        created_at: Date;
        s3_key: string;
      }>(
        `SELECT id, original_name, mime_type, size_bytes, uploaded_by, created_at, s3_key
         FROM media_files
         ${whereSql} AND s3_key IS NOT NULL
         ORDER BY ${sortBy} ${sortDir}, id ${sortDir}
         LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        values,
      );

      return res.rows.map((row) => ({
        id: row.id,
        kind: kindFromMime(row.mime_type),
        mimeType: row.mime_type,
        filename: row.original_name,
        size: Number(row.size_bytes),
        userId: row.uploaded_by,
        createdAt: row.created_at.toISOString(),
        url: s3PublicUrl(row.s3_key),
      }));
    },

    async findUsage(mediaId: string): Promise<MediaUsageRef[]> {
      const pool = getPool();
      const mediaUrl = `/api/media/${mediaId}`;
      const keyRes = await pool.query<{ s3_key: string | null }>(
        `SELECT s3_key FROM media_files WHERE id = $1::uuid`,
        [mediaId],
      );
      const s3Key = keyRes.rows[0]?.s3_key ?? null;
      const publicUrl = s3Key ? s3PublicUrl(s3Key) : null;

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

        await pool.query(`UPDATE media_files SET status = 'deleting' WHERE id = $1::uuid`, [mediaId]);

        if (!row.s3_key) {
          await pool.query(`UPDATE media_files SET status = $2 WHERE id = $1::uuid`, [mediaId, row.status]);
          return false;
        }

        try {
          await s3DeleteObject(row.s3_key);
        } catch {
          await pool.query(`UPDATE media_files SET status = $2 WHERE id = $1::uuid`, [mediaId, row.status]);
          return false;
        }

        const del = await pool.query(`DELETE FROM media_files WHERE id = $1::uuid`, [mediaId]);
        return (del.rowCount ?? 0) > 0;
      } finally {
        await pool.query(`SELECT pg_advisory_unlock(hashtext($1))`, [mediaId]);
      }
    },
  };
}

/** Insert pending row + return presign target (presign route). */
export async function insertPendingMediaFile(params: {
  id: string;
  filename: string;
  key: string;
  mimeType: string;
  sizeBytes: number;
  userId: string;
}): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO media_files (id, original_name, stored_path, s3_key, mime_type, size_bytes, status, uploaded_by)
     VALUES ($1::uuid, $2, $3, $4, $5, $6, 'pending', $7::uuid)`,
    [
      params.id,
      params.filename,
      params.key,
      params.key,
      params.mimeType,
      params.sizeBytes,
      params.userId,
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

/** For GET /api/media/[id]: redirect to public object when row is S3-backed and not pending. */
export async function getMediaS3KeyForRedirect(id: string): Promise<string | null> {
  const pool = getPool();
  const res = await pool.query<{ s3_key: string | null }>(
    `SELECT s3_key FROM media_files WHERE id = $1::uuid AND s3_key IS NOT NULL AND (status IS NULL OR status NOT IN ('pending', 'deleting'))`,
    [id],
  );
  return res.rows[0]?.s3_key ?? null;
}
