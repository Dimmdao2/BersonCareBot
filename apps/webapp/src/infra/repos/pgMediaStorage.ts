import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { env } from "@/config/env";
import { getPool } from "@/infra/db/client";
import type { MediaStoragePort } from "@/modules/media/ports";
import type { MediaRecord } from "@/modules/media/types";

const MAX_BYTES = 50 * 1024 * 1024;

function kindFromMime(mimeType: string): MediaRecord["kind"] {
  const lower = mimeType.toLowerCase();
  if (lower.startsWith("image/")) return "image";
  if (lower.startsWith("audio/")) return "audio";
  if (lower.startsWith("video/")) return "video";
  return "image";
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
