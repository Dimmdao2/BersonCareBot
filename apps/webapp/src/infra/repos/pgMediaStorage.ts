import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { env } from "@/config/env";
import { getPool } from "@/infra/db/client";
import type { MediaStoragePort } from "@/modules/media/ports";
import type { MediaListParams, MediaRecord, MediaUsageRef } from "@/modules/media/types";

const MAX_BYTES = 50 * 1024 * 1024;

function kindFromMime(mimeType: string): MediaRecord["kind"] {
  const lower = mimeType.toLowerCase();
  if (lower.startsWith("image/")) return "image";
  if (lower.startsWith("audio/")) return "audio";
  if (lower.startsWith("video/")) return "video";
  return "file";
}

function mediaBaseDir(): string {
  const custom = env.MEDIA_STORAGE_DIR?.trim();
  if (custom) return custom;
  return join(process.cwd(), "var", "media");
}

export function createPgMediaStoragePort(): MediaStoragePort {
  const baseDir = mediaBaseDir();

  return {
    async upload(params) {
      const body =
        params.body instanceof ArrayBuffer
          ? params.body
          : new Uint8Array(params.body).buffer;
      if (body.byteLength > MAX_BYTES) {
        throw new Error("media_upload_too_large");
      }
      if (body.byteLength === 0) {
        throw new Error("media_upload_empty");
      }

      const pool = getPool();
      const idRow = await pool.query<{ id: string }>(`SELECT gen_random_uuid()::text AS id`);
      const id = idRow.rows[0]?.id;
      if (!id) throw new Error("media_upload_id");

      const storedName = id;
      const storedPath = storedName;
      const fullPath = join(baseDir, storedName);
      await mkdir(baseDir, { recursive: true });
      await writeFile(fullPath, Buffer.from(body));

      await pool.query(
        `INSERT INTO media_files (id, original_name, stored_path, mime_type, size_bytes, uploaded_by)
         VALUES ($1::uuid, $2, $3, $4, $5, $6::uuid)`,
        [
          id,
          params.filename,
          storedPath,
          params.mimeType,
          body.byteLength,
          params.userId ?? null,
        ]
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
      const url = `/api/media/${id}`;
      return { record, url };
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
         FROM media_files WHERE id = $1::uuid`,
        [id]
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
      const res = await pool.query(`SELECT 1 FROM media_files WHERE id = $1::uuid`, [id]);
      return res.rowCount ? `/api/media/${id}` : null;
    },

    async list(params: MediaListParams) {
      const pool = getPool();
      const where: string[] = [];
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
            `NOT (mime_type LIKE 'image/%' OR mime_type LIKE 'video/%' OR mime_type LIKE 'audio/%')`
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

      const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
      const res = await pool.query<{
        id: string;
        original_name: string;
        mime_type: string;
        size_bytes: number | string;
        uploaded_by: string | null;
        created_at: Date;
      }>(
        `SELECT id, original_name, mime_type, size_bytes, uploaded_by, created_at
         FROM media_files
         ${whereSql}
         ORDER BY ${sortBy} ${sortDir}, id ${sortDir}
         LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        values
      );

      return res.rows.map((row) => ({
        id: row.id,
        kind: kindFromMime(row.mime_type),
        mimeType: row.mime_type,
        filename: row.original_name,
        size: Number(row.size_bytes),
        userId: row.uploaded_by,
        createdAt: row.created_at.toISOString(),
      }));
    },

    async findUsage(mediaId: string): Promise<MediaUsageRef[]> {
      const pool = getPool();
      const mediaUrl = `/api/media/${mediaId}`;
      const res = await pool.query<MediaUsageRef>(
        `SELECT id::text AS "pageId", slug AS "pageSlug", 'image_url'::text AS field
           FROM content_pages
          WHERE image_url = $1
         UNION ALL
         SELECT id::text AS "pageId", slug AS "pageSlug", 'video_url'::text AS field
           FROM content_pages
          WHERE video_url = $1 OR (video_type = 'api' AND video_url = $2)
         UNION ALL
         SELECT id::text AS "pageId", slug AS "pageSlug", 'body_md'::text AS field
           FROM content_pages
          WHERE body_md LIKE $3
         UNION ALL
         SELECT id::text AS "pageId", slug AS "pageSlug", 'body_html'::text AS field
           FROM content_pages
          WHERE body_html LIKE $3`,
        [mediaUrl, mediaId, `%${mediaUrl}%`]
      );
      return res.rows.map((row) => ({
        pageId: row.pageId,
        pageSlug: row.pageSlug,
        field: row.field,
      }));
    },

    async deleteHard(mediaId: string) {
      const pool = getPool();
      const res = await pool.query<{ stored_path: string }>(
        `DELETE FROM media_files WHERE id = $1::uuid RETURNING stored_path`,
        [mediaId]
      );
      const row = res.rows[0];
      if (!row) return false;
      const fullPath = join(baseDir, row.stored_path);
      try {
        await unlink(fullPath);
      } catch (error) {
        const code =
          typeof error === "object" && error && "code" in error
            ? String((error as { code?: string }).code ?? "")
            : "";
        if (code !== "ENOENT") throw error;
      }
      return true;
    },
  };
}

/** Load file bytes for GET /api/media/[id] (Postgres-backed uploads). */
export async function readPgMediaFileBody(id: string): Promise<{ body: Buffer; mimeType: string } | null> {
  const pool = getPool();
  const res = await pool.query<{ stored_path: string; mime_type: string }>(
    `SELECT stored_path, mime_type FROM media_files WHERE id = $1::uuid`,
    [id]
  );
  const row = res.rows[0];
  if (!row) return null;
  const fullPath = join(mediaBaseDir(), row.stored_path);
  try {
    const body = await readFile(fullPath);
    return { body, mimeType: row.mime_type };
  } catch {
    return null;
  }
}
