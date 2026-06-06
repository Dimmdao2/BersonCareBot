import type { PoolClient } from "pg";
import { toIsoStringSafe } from "@/shared/lib/toIsoStringSafe";
import { and, eq, sql, type SQL } from "drizzle-orm";
import { env } from "@/config/env";
import { getPool } from "@/infra/db/client";
import { pgSessionAdvisoryLock, pgSessionAdvisoryUnlock } from "@/infra/db/pgAdvisoryLock";
import {
  getWebappSqlDb,
  getWebappSqlFromPgClient,
  runWebappSql,
} from "@/infra/db/runWebappSql";
import { logger } from "@/infra/logging/logger";
import {
  pgCreateFolder,
  pgDeleteFolderIfEmpty,
  pgListAllFolders,
  pgListFolders,
  pgMoveFolder,
  pgRenameFolder,
} from "@/infra/repos/mediaFoldersRepo";
import { mediaFolderExists } from "@/infra/repos/pgMediaFolderLookup";
import { pgMediaUsageSummaryForMediaId } from "@/infra/repos/pgMediaUsageSummary";
import { s3DeleteObject, s3ListObjectKeysUnderPrefix, s3ObjectKey, s3PublicUrl, s3PutObjectBody } from "@/infra/s3/client";
import type { MediaStoragePort } from "@/modules/media/ports";
import { MAX_MEDIA_BYTES } from "@/modules/media/uploadAllowedMime";
import type { MediaListParams, MediaPreviewStatus, MediaRecord, MediaUsageRef } from "@/modules/media/types";
import {
  parseAvailableQualitiesJson,
  parseVideoDeliveryOverride,
  parseVideoProcessingStatus,
} from "@/modules/media/videoHlsFields";
import { mediaPreviewUrlById } from "@/shared/lib/mediaPreviewUrls";
import {
  isTrustedHlsArtifactS3Key,
  isTrustedPosterS3Key,
  resolveHlsPurgeListPrefix,
  resolvePosterPurgeListPrefix,
} from "@/shared/lib/hlsStorageLayout";
import { pgRuSubstringSearchPattern } from "@/shared/lib/ruSearchNormalize";
import { mediaFiles } from "../../../db/schema/schema";
import {
  mediaReadableStatusPredicate,
  mediaReadableStatusPredicateM,
  mediaS3PurgeStatusPredicate,
} from "@/infra/repos/mediaSqlPredicates";

export {
  MEDIA_READABLE_STATUS_SQL,
  MEDIA_READABLE_STATUS_SQL_M,
  MEDIA_S3_PURGE_STATUS_SQL,
} from "@/infra/repos/mediaSqlPredicates";

function mediaAppUrl(mediaId: string): string {
  return `/api/media/${mediaId}`;
}

function kindFromMime(mimeType: string): MediaRecord["kind"] {
  const lower = mimeType.toLowerCase();
  if (lower.startsWith("image/")) return "image";
  if (lower.startsWith("audio/")) return "audio";
  if (lower.startsWith("video/")) return "video";
  return "file";
}

function mapVideoHlsColumns(row: {
  video_processing_status: string | null;
  video_processing_error: string | null;
  hls_master_playlist_s3_key: string | null;
  hls_artifact_prefix: string | null;
  poster_s3_key: string | null;
  video_duration_seconds: number | null;
  available_qualities_json: unknown;
  video_delivery_override: string | null;
}) {
  const err = row.video_processing_error?.trim();
  return {
    videoProcessingStatus: parseVideoProcessingStatus(row.video_processing_status),
    videoProcessingError: err ? err : null,
    hlsMasterPlaylistS3Key: row.hls_master_playlist_s3_key?.trim()
      ? row.hls_master_playlist_s3_key
      : null,
    hlsArtifactPrefix: row.hls_artifact_prefix?.trim() ? row.hls_artifact_prefix : null,
    posterS3Key: row.poster_s3_key?.trim() ? row.poster_s3_key : null,
    videoDurationSeconds:
      row.video_duration_seconds != null && Number.isFinite(Number(row.video_duration_seconds))
        ? Number(row.video_duration_seconds)
        : null,
    availableQualities: parseAvailableQualitiesJson(row.available_qualities_json),
    videoDeliveryOverride: parseVideoDeliveryOverride(row.video_delivery_override),
  };
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

      const idRow = await runWebappSql<{ id: string }>(
        getWebappSqlDb(),
        sql`SELECT gen_random_uuid()::text AS id`,
      );
      const id = idRow.rows[0]?.id;
      if (!id) throw new Error("media_upload_id");

      const key = s3ObjectKey(id, params.filename);
      const buf = Buffer.from(body);
      await s3PutObjectBody(key, buf, params.mimeType);

      const folderId = params.folderId ?? null;
      await getWebappSqlDb().insert(mediaFiles).values({
        id,
        originalName: params.filename,
        storedPath: key,
        s3Key: key,
        mimeType: params.mimeType,
        sizeBytes: body.byteLength,
        status: "ready",
        uploadedBy: params.userId ?? null,
        folderId,
      });

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
      const res = await runWebappSql<{
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
        video_processing_status: string | null;
        video_processing_error: string | null;
        hls_master_playlist_s3_key: string | null;
        hls_artifact_prefix: string | null;
        poster_s3_key: string | null;
        video_duration_seconds: number | null;
        available_qualities_json: unknown;
        video_delivery_override: string | null;
      }>(
        getWebappSqlDb(),
        sql`SELECT m.id, m.original_name, m.display_name, m.mime_type, m.size_bytes, m.uploaded_by,
            COALESCE(
              NULLIF(TRIM(CONCAT_WS(' ', pu.first_name, pu.last_name)), ''),
              NULLIF(TRIM(pu.display_name), '')
            ) AS uploaded_by_name,
            m.created_at,
            m.preview_status, m.preview_sm_key, m.preview_md_key,
            m.source_width, m.source_height,
            m.video_processing_status, m.video_processing_error,
            m.hls_master_playlist_s3_key, m.hls_artifact_prefix, m.poster_s3_key,
            m.video_duration_seconds, m.available_qualities_json, m.video_delivery_override
         FROM media_files m
         LEFT JOIN platform_users pu ON pu.id = m.uploaded_by
         WHERE m.id = ${id}::uuid AND ${mediaReadableStatusPredicateM}`,
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
        createdAt: toIsoStringSafe(row.created_at),
        previewStatus,
        previewSmUrl: row.preview_sm_key?.trim() ? mediaPreviewUrlById(row.id, "sm") : null,
        previewMdUrl: row.preview_md_key?.trim() ? mediaPreviewUrlById(row.id, "md") : null,
        sourceWidth: row.source_width ?? null,
        sourceHeight: row.source_height ?? null,
        ...mapVideoHlsColumns(row),
      };
    },

    async getUrl(id: string) {
      const res = await runWebappSql<{ s3_key: string }>(
        getWebappSqlDb(),
        sql`SELECT s3_key FROM media_files
         WHERE id = ${id}::uuid AND s3_key IS NOT NULL AND ${mediaReadableStatusPredicate}`,
      );
      const row = res.rows[0];
      if (!row) return null;
      return mediaAppUrl(id);
    },

    async list(params: MediaListParams) {
      const whereParts: SQL[] = [mediaReadableStatusPredicateM];

      if (params.kind && params.kind !== "all") {
        if (params.kind === "file") {
          whereParts.push(
            sql`NOT (m.mime_type LIKE 'image/%' OR m.mime_type LIKE 'video/%' OR m.mime_type LIKE 'audio/%')`,
          );
        } else if (params.kind === "image") {
          whereParts.push(sql`m.mime_type LIKE 'image/%'`);
        } else if (params.kind === "video") {
          whereParts.push(sql`m.mime_type LIKE 'video/%'`);
        } else if (params.kind === "audio") {
          whereParts.push(sql`m.mime_type LIKE 'audio/%'`);
        }
      }

      const pattern = params.query ? pgRuSubstringSearchPattern(params.query) : null;
      if (pattern) {
        whereParts.push(
          sql`(normalize(m.display_name, NFC) ILIKE ${pattern} ESCAPE '\\' OR normalize(m.original_name, NFC) ILIKE ${pattern} ESCAPE '\\')`,
        );
      }

      if (params.folderId !== undefined) {
        if (params.folderId === null) {
          whereParts.push(sql`m.folder_id IS NULL`);
        } else if (params.includeDescendants) {
          whereParts.push(sql`m.folder_id IN (
              WITH RECURSIVE sub AS (
                SELECT id FROM media_folders WHERE id = ${params.folderId}::uuid
                UNION ALL
                SELECT f.id FROM media_folders f INNER JOIN sub ON f.parent_id = sub.id
              )
              SELECT id FROM sub
            )`);
        } else {
          whereParts.push(sql`m.folder_id = ${params.folderId}::uuid`);
        }
      }

      const whereSql = sql.join(whereParts, sql` AND `);
      const sortDir = params.sortDir === "asc" ? sql`ASC` : sql`DESC`;
      const nameSortKey = sql`LOWER(COALESCE(NULLIF(TRIM(m.display_name), ''), m.original_name))`;
      const orderBy =
        params.sortBy === "name"
          ? sql`CASE
               WHEN ${nameSortKey} ~ '^[0-9]' THEN 0
               WHEN ${nameSortKey} ~ '^[a-z]' THEN 1
               WHEN ${nameSortKey} ~ '^[а-яё]' THEN 2
               ELSE 3
             END ${sortDir},
             ${nameSortKey} ${sortDir},
             m.id ${sortDir}`
          : params.sortBy === "size"
            ? sql`m.size_bytes ${sortDir}, m.id ${sortDir}`
            : params.sortBy === "kind"
              ? sql`m.mime_type ${sortDir}, m.id ${sortDir}`
              : sql`m.created_at ${sortDir}, m.id ${sortDir}`;

      const limit = Math.max(1, Math.min(200, params.limit ?? 50));
      const offset = Math.max(0, params.offset ?? 0);

      const res = await runWebappSql<{
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
        video_processing_status: string | null;
        video_processing_error: string | null;
        hls_master_playlist_s3_key: string | null;
        hls_artifact_prefix: string | null;
        poster_s3_key: string | null;
        video_duration_seconds: number | null;
        available_qualities_json: unknown;
        video_delivery_override: string | null;
        total_count: string;
      }>(
        getWebappSqlDb(),
        sql`SELECT m.id, m.original_name, m.display_name, m.mime_type, m.size_bytes, m.uploaded_by,
            COALESCE(
              NULLIF(TRIM(CONCAT_WS(' ', pu.first_name, pu.last_name)), ''),
              NULLIF(TRIM(pu.display_name), '')
            ) AS uploaded_by_name,
            m.created_at, m.s3_key, m.folder_id,
            m.preview_status, m.preview_sm_key, m.preview_md_key,
            m.source_width, m.source_height,
            m.video_processing_status, m.video_processing_error,
            m.hls_master_playlist_s3_key, m.hls_artifact_prefix, m.poster_s3_key,
            m.video_duration_seconds, m.available_qualities_json, m.video_delivery_override,
            COUNT(*) OVER()::text AS total_count
         FROM media_files m
         LEFT JOIN platform_users pu ON pu.id = m.uploaded_by
         WHERE ${whereSql} AND m.s3_key IS NOT NULL
         ORDER BY ${orderBy}
         LIMIT ${limit} OFFSET ${offset}`,
      );

      const total = res.rows.length > 0 ? Number(res.rows[0]!.total_count) : 0;
      const items = res.rows.map((row) => {
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
          createdAt: toIsoStringSafe(row.created_at),
          folderId: row.folder_id,
          url: mediaAppUrl(row.id),
          previewStatus,
          previewSmUrl: row.preview_sm_key?.trim() ? mediaPreviewUrlById(row.id, "sm") : null,
          previewMdUrl: row.preview_md_key?.trim() ? mediaPreviewUrlById(row.id, "md") : null,
          sourceWidth: row.source_width ?? null,
          sourceHeight: row.source_height ?? null,
          ...mapVideoHlsColumns(row),
        };
      });
      return { items, total };
    },

    async updateDisplayName(mediaId: string, displayName: string | null) {
      const normalized = displayName?.trim() || null;
      const res = await runWebappSql(
        getWebappSqlDb(),
        sql`UPDATE media_files m
            SET display_name = ${normalized}
          WHERE m.id = ${mediaId}::uuid AND ${mediaReadableStatusPredicateM}`,
      );
      return (res.rowCount ?? 0) > 0;
    },

    async updateMediaFolder(mediaId: string, folderId: string | null) {
      const res = await runWebappSql(
        getWebappSqlDb(),
        sql`UPDATE media_files m
            SET folder_id = ${folderId}
          WHERE m.id = ${mediaId}::uuid AND ${mediaReadableStatusPredicateM}`,
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

    async folderExists(folderId: string) {
      return mediaFolderExists(folderId);
    },

    async findUsage(mediaId: string): Promise<MediaUsageRef[]> {
      const mediaUrl = `/api/media/${mediaId}`;
      const keyRes = await runWebappSql<{ s3_key: string | null }>(
        getWebappSqlDb(),
        sql`SELECT s3_key FROM media_files WHERE id = ${mediaId}::uuid`,
      );
      const s3Key = keyRes.rows[0]?.s3_key ?? null;
      const publicUrl =
        s3Key && env.S3_PUBLIC_BUCKET ? s3PublicUrl(s3Key) : null;

      const res = await runWebappSql<MediaUsageRef>(
        getWebappSqlDb(),
        sql`SELECT id::text AS "pageId", slug AS "pageSlug", 'image_url'::text AS field
           FROM content_pages
          WHERE image_url = ${mediaUrl} OR (${publicUrl}::text IS NOT NULL AND image_url = ${publicUrl})
         UNION ALL
         SELECT id::text AS "pageId", slug AS "pageSlug", 'video_url'::text AS field
           FROM content_pages
          WHERE video_url = ${mediaUrl} OR (${publicUrl}::text IS NOT NULL AND video_url = ${publicUrl})
              OR (video_type = 'api' AND video_url = ${mediaId})
         UNION ALL
         SELECT id::text AS "pageId", slug AS "pageSlug", 'body_md'::text AS field
           FROM content_pages
          WHERE body_md LIKE ${`%${mediaUrl}%`} OR (${publicUrl}::text IS NOT NULL AND body_md LIKE ${publicUrl ? `%${publicUrl}%` : null})
         UNION ALL
         SELECT id::text AS "pageId", slug AS "pageSlug", 'body_html'::text AS field
           FROM content_pages
          WHERE body_html LIKE ${`%${mediaUrl}%`} OR (${publicUrl}::text IS NOT NULL AND body_html LIKE ${publicUrl ? `%${publicUrl}%` : null})`,
      );
      return res.rows.map((row) => ({
        pageId: row.pageId,
        pageSlug: row.pageSlug,
        field: row.field,
      }));
    },

    async getUsageSummary(mediaId: string) {
      return pgMediaUsageSummaryForMediaId(mediaId);
    },

    async deleteHard(mediaId: string) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        await pgSessionAdvisoryLock(client, mediaId);
        try {
          const db = getWebappSqlFromPgClient(client);
          const sel = await runWebappSql<{ s3_key: string | null; status: string | null }>(
            db,
            sql`SELECT s3_key, status FROM media_files WHERE id = ${mediaId}::uuid`,
          );
          const row = sel.rows[0];
          if (!row) return false;

          if (row.status === "pending_delete") {
            return true;
          }

          if (!row.s3_key) {
            const del = await runWebappSql(
              db,
              sql`DELETE FROM media_files WHERE id = ${mediaId}::uuid`,
            );
            return (del.rowCount ?? 0) > 0;
          }

          await runWebappSql(
            db,
            sql`UPDATE media_files SET status = 'pending_delete' WHERE id = ${mediaId}::uuid`,
          );
          return true;
        } finally {
          await pgSessionAdvisoryUnlock(client, mediaId);
        }
      } finally {
        client.release();
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
  const db = getWebappSqlFromPgClient(client);
  await db.insert(mediaFiles).values({
    id: params.id,
    originalName: params.filename,
    storedPath: params.key,
    s3Key: params.key,
    mimeType: params.mimeType,
    sizeBytes: params.sizeBytes,
    status: "pending",
    uploadedBy: params.userId,
    folderId: params.folderId ?? null,
  });
}

/** Patient program-item submission upload (usage_purpose + mp4 override for video). */
export async function insertPendingProgramSubmissionMediaFileTx(
  client: PoolClient,
  params: {
    id: string;
    filename: string;
    key: string;
    mimeType: string;
    sizeBytes: number;
    userId: string;
  },
): Promise<void> {
  const isVideo = params.mimeType.toLowerCase().startsWith("video/");
  const db = getWebappSqlFromPgClient(client);
  await db.insert(mediaFiles).values({
    id: params.id,
    originalName: params.filename,
    storedPath: params.key,
    s3Key: params.key,
    mimeType: params.mimeType,
    sizeBytes: params.sizeBytes,
    status: "pending",
    uploadedBy: params.userId,
    usagePurpose: "program_item_submission",
    videoDeliveryOverride: isVideo ? "mp4" : null,
  });
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
  await getWebappSqlDb().insert(mediaFiles).values({
    id: params.id,
    originalName: params.filename,
    storedPath: params.key,
    s3Key: params.key,
    mimeType: params.mimeType,
    sizeBytes: params.sizeBytes,
    status: "pending",
    uploadedBy: params.userId,
    folderId: params.folderId ?? null,
  });
}

/** Row for confirm flow: same owner, any status (pending or ready for idempotency). */
export async function getMediaRowForConfirm(
  mediaId: string,
  userId: string,
): Promise<{
  s3_key: string | null;
  status: string;
  mime_type: string;
  usage_purpose: string | null;
  size_bytes: number | null;
} | null> {
  const res = await runWebappSql<{
    s3_key: string | null;
    status: string;
    mime_type: string;
    usage_purpose: string | null;
    size_bytes: string | null;
  }>(
    getWebappSqlDb(),
    sql`SELECT s3_key, status, mime_type, usage_purpose, size_bytes::text
     FROM media_files WHERE id = ${mediaId}::uuid AND uploaded_by = ${userId}::uuid`,
  );
  const row = res.rows[0];
  if (!row) return null;
  const sizeRaw = row.size_bytes != null ? Number(row.size_bytes) : null;
  return {
    s3_key: row.s3_key,
    status: row.status,
    mime_type: row.mime_type,
    usage_purpose: row.usage_purpose,
    size_bytes: sizeRaw != null && Number.isFinite(sizeRaw) ? sizeRaw : null,
  };
}

export async function confirmMediaFileReady(mediaId: string): Promise<boolean> {
  const rows = await getWebappSqlDb()
    .update(mediaFiles)
    .set({ status: "ready" })
    .where(and(eq(mediaFiles.id, mediaId), eq(mediaFiles.status, "pending")))
    .returning({ id: mediaFiles.id });
  return rows.length > 0;
}

/** Confirm patient program submission upload (must have usage_purpose set at presign). */
export async function confirmProgramSubmissionMediaFileReady(mediaId: string): Promise<boolean> {
  const res = await runWebappSql(
    getWebappSqlDb(),
    sql`UPDATE media_files SET status = 'ready'
     WHERE id = ${mediaId}::uuid AND status = 'pending' AND usage_purpose = 'program_item_submission'`,
  );
  return (res.rowCount ?? 0) > 0;
}

export type ProgramSubmissionMediaAttachRow = {
  id: string;
  mime_type: string;
  status: string;
  video_processing_status: string | null;
};

export type ProgramSubmissionMediaStatusRow = {
  id: string;
  mime_type: string;
  status: string;
  video_processing_status: string | null;
  video_processing_error: string | null;
};

/** Owner row for program-submission status polling (attach readiness). */
export async function getProgramSubmissionMediaStatusRow(
  mediaId: string,
  patientUserId: string,
): Promise<ProgramSubmissionMediaStatusRow | null> {
  const res = await runWebappSql<ProgramSubmissionMediaStatusRow>(
    getWebappSqlDb(),
    sql`SELECT id::text, mime_type, status, video_processing_status, video_processing_error
     FROM media_files
     WHERE id = ${mediaId}::uuid
       AND uploaded_by = ${patientUserId}::uuid
       AND usage_purpose = 'program_item_submission'`,
  );
  return res.rows[0] ?? null;
}

export function isProgramSubmissionMediaAttachReady(row: ProgramSubmissionMediaStatusRow): boolean {
  if (row.status !== "ready") return false;
  if (!row.mime_type.toLowerCase().startsWith("video/")) return true;
  return row.video_processing_status === "ready";
}

/** Row eligible for attach: images when file ready; video only after 480p transcode ready. */
export async function getMediaRowForProgramSubmissionAttach(
  mediaId: string,
  patientUserId: string,
): Promise<ProgramSubmissionMediaAttachRow | null> {
  const row = await getProgramSubmissionMediaStatusRow(mediaId, patientUserId);
  if (!row || !isProgramSubmissionMediaAttachReady(row)) return null;
  return {
    id: row.id,
    mime_type: row.mime_type,
    status: row.status,
    video_processing_status: row.video_processing_status,
  };
}

export async function markProgramSubmissionVideoProcessingFailed(
  mediaId: string,
  errorMessage: string,
): Promise<void> {
  const msg = errorMessage.slice(0, 8000);
  await getWebappSqlDb()
    .update(mediaFiles)
    .set({
      videoProcessingStatus: "failed",
      videoProcessingError: msg,
    })
    .where(and(eq(mediaFiles.id, mediaId), eq(mediaFiles.usagePurpose, "program_item_submission")));
}

export type MediaAccessRow = {
  usage_purpose: string | null;
  uploaded_by: string;
  mime_type: string;
};

export async function getMediaAccessRow(id: string): Promise<MediaAccessRow | null> {
  const res = await runWebappSql<MediaAccessRow>(
    getWebappSqlDb(),
    sql`SELECT usage_purpose, uploaded_by::text, mime_type
     FROM media_files
     WHERE id = ${id}::uuid AND ${mediaReadableStatusPredicate}`,
  );
  return res.rows[0] ?? null;
}

/** Roll back presign INSERT when presigned URL generation fails. */
export async function deletePendingMediaFileById(mediaId: string): Promise<boolean> {
  const rows = await getWebappSqlDb()
    .delete(mediaFiles)
    .where(and(eq(mediaFiles.id, mediaId), eq(mediaFiles.status, "pending")))
    .returning({ id: mediaFiles.id });
  return rows.length > 0;
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
  const cap = Math.min(100, Math.max(1, limit));
  const countRes = await runWebappSql<{ c: string }>(
    getWebappSqlDb(),
    sql`SELECT count(*)::text AS c FROM media_files
     WHERE status IN ('pending_delete', 'deleting') AND COALESCE(delete_attempts, 0) > 0`,
  );
  const total = Number.parseInt(countRes.rows[0]?.c ?? "0", 10);
  const res = await runWebappSql<MediaDeleteErrorRow>(
    getWebappSqlDb(),
    sql`SELECT id::text, original_name, COALESCE(delete_attempts, 0)::int AS delete_attempts,
            next_attempt_at::text, created_at::text
       FROM media_files
      WHERE status IN ('pending_delete', 'deleting') AND COALESCE(delete_attempts, 0) > 0
      ORDER BY delete_attempts DESC, id ASC
      LIMIT ${cap}`,
  );
  return { items: res.rows, total };
}

/** Row for `GET /api/media/[id]/playback` (JSON + presign HLS master / poster). */
export type MediaPlaybackRow = {
  id: string;
  mime_type: string;
  s3_key: string;
  video_processing_status: string | null;
  hls_master_playlist_s3_key: string | null;
  poster_s3_key: string | null;
  video_duration_seconds: number | null;
  available_qualities_json: unknown;
  video_delivery_override: string | null;
  usage_purpose: string | null;
  uploaded_by: string;
};

export async function getMediaRowForPlayback(id: string): Promise<MediaPlaybackRow | null> {
  const res = await runWebappSql<MediaPlaybackRow>(
    getWebappSqlDb(),
    sql`SELECT id::text, mime_type, s3_key,
            video_processing_status, hls_master_playlist_s3_key, poster_s3_key,
            video_duration_seconds, available_qualities_json, video_delivery_override,
            usage_purpose, uploaded_by::text
     FROM media_files
     WHERE id = ${id}::uuid AND s3_key IS NOT NULL AND length(trim(s3_key)) > 0 AND ${mediaReadableStatusPredicate}`,
  );
  return res.rows[0] ?? null;
}

/** For GET /api/media/[id]: S3 key when row may be redirected (presigned GET to private bucket). */
export async function getMediaS3KeyForRedirect(id: string): Promise<string | null> {
  const res = await runWebappSql<{ s3_key: string | null }>(
    getWebappSqlDb(),
    sql`SELECT s3_key FROM media_files WHERE id = ${id}::uuid AND s3_key IS NOT NULL AND ${mediaReadableStatusPredicate}`,
  );
  return res.rows[0]?.s3_key ?? null;
}

/** Presigned-GET target for generated preview JPEG (sm/md). */
export async function getMediaPreviewS3KeyForRedirect(
  id: string,
  size: "sm" | "md",
): Promise<string | null> {
  const res = await runWebappSql<{
    preview_sm_key: string | null;
    preview_md_key: string | null;
    preview_status: string | null;
  }>(
    getWebappSqlDb(),
    sql`SELECT preview_sm_key, preview_md_key, preview_status
     FROM media_files
     WHERE id = ${id}::uuid AND ${mediaReadableStatusPredicate}`,
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
 * Resolves all S3 object keys to delete for a media row in `pending_delete` / `deleting`:
 * preview JPEGs, entire HLS prefix (variants + master + legacy segments), poster prefix/object, source MP4.
 */
export async function collectS3KeysForMediaPurge(row: {
  id: string;
  s3_key: string;
  preview_sm_key: string | null;
  preview_md_key: string | null;
  hls_artifact_prefix: string | null;
  poster_s3_key: string | null;
  hls_master_playlist_s3_key: string | null;
}): Promise<string[]> {
  const keysToDeleteSet = new Set<string>();
  for (const k of [row.preview_sm_key, row.preview_md_key]) {
    if (k?.trim()) keysToDeleteSet.add(k.trim());
  }

  const hlsListPrefix = resolveHlsPurgeListPrefix({
    mediaId: row.id,
    sourceS3Key: row.s3_key,
    hlsArtifactPrefix: row.hls_artifact_prefix,
  });
  if (hlsListPrefix) {
    const hlsKeys = await s3ListObjectKeysUnderPrefix(hlsListPrefix);
    for (const k of hlsKeys) keysToDeleteSet.add(k);
  } else if (row.hls_master_playlist_s3_key?.trim()) {
    const mk = row.hls_master_playlist_s3_key.trim();
    if (isTrustedHlsArtifactS3Key(row.id, mk)) {
      keysToDeleteSet.add(mk);
    } else {
      logger.warn(
        { mediaId: row.id, key: mk },
        "[collectS3KeysForMediaPurge] skipped untrusted hls_master_playlist_s3_key",
      );
    }
  }

  const posterExplicit = row.poster_s3_key?.trim();
  if (posterExplicit) {
    if (isTrustedPosterS3Key(row.id, posterExplicit)) {
      keysToDeleteSet.add(posterExplicit);
    } else {
      logger.warn(
        { mediaId: row.id, key: posterExplicit },
        "[collectS3KeysForMediaPurge] skipped untrusted poster_s3_key; trying canonical poster prefix list",
      );
      const posterListPrefix = resolvePosterPurgeListPrefix(row.id, row.s3_key);
      if (posterListPrefix) {
        const posterKeys = await s3ListObjectKeysUnderPrefix(posterListPrefix);
        for (const k of posterKeys) keysToDeleteSet.add(k);
      }
    }
  } else {
    const posterListPrefix = resolvePosterPurgeListPrefix(row.id, row.s3_key);
    if (posterListPrefix) {
      const posterKeys = await s3ListObjectKeysUnderPrefix(posterListPrefix);
      for (const k of posterKeys) keysToDeleteSet.add(k);
    }
  }

  if (row.s3_key?.trim()) keysToDeleteSet.add(row.s3_key.trim());

  return [...keysToDeleteSet];
}

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
    const db = getWebappSqlFromPgClient(client);
    try {
      await client.query("BEGIN");
      const claim = await runWebappSql<{
        id: string;
        s3_key: string;
        preview_sm_key: string | null;
        preview_md_key: string | null;
        hls_artifact_prefix: string | null;
        poster_s3_key: string | null;
        hls_master_playlist_s3_key: string | null;
        status: string | null;
        delete_attempts: number | null;
      }>(
        db,
        sql`SELECT id, s3_key, preview_sm_key, preview_md_key,
                hls_artifact_prefix, poster_s3_key, hls_master_playlist_s3_key,
                status, COALESCE(delete_attempts, 0) AS delete_attempts
         FROM media_files
         WHERE ${mediaS3PurgeStatusPredicate} AND s3_key IS NOT NULL AND length(trim(s3_key)) > 0
         AND (next_attempt_at IS NULL OR next_attempt_at <= now())
         ORDER BY id ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED`,
      );
      const rows = claim.rows;
      if (rows.length === 0) {
        await client.query("COMMIT");
        break;
      }

      const row = rows[0]!;
      if (row.status !== "pending_delete" && row.status !== "deleting") {
        await client.query("ROLLBACK");
        continue;
      }

      let keysToDelete: string[];
      try {
        keysToDelete = await collectS3KeysForMediaPurge(row);
      } catch (e) {
        logger.error({ err: e, mediaId: row.id }, "[purgePendingMediaDeleteBatch] failed to list keys");
        const prevAttempts = row.delete_attempts ?? 0;
        const exp = Math.min(prevAttempts + 1, 20);
        const minutes = Math.min(1440, Math.pow(2, exp));
        await runWebappSql(
          db,
          sql`UPDATE media_files SET
             delete_attempts = delete_attempts + 1,
             next_attempt_at = now() + (${minutes}::numeric * interval '1 minute')
           WHERE id = ${row.id}::uuid`,
        );
        await client.query("COMMIT");
        errors += 1;
        continue;
      }

      try {
        for (const key of keysToDelete) {
          await s3DeleteObject(key);
        }
      } catch (e) {
        const prevAttempts = row.delete_attempts ?? 0;
        const exp = Math.min(prevAttempts + 1, 20);
        const minutes = Math.min(1440, Math.pow(2, exp));
        await runWebappSql(
          db,
          sql`UPDATE media_files SET
             delete_attempts = delete_attempts + 1,
             next_attempt_at = now() + (${minutes}::numeric * interval '1 minute')
           WHERE id = ${row.id}::uuid`,
        );
        await client.query("COMMIT");
        errors += 1;
        logger.error({ err: e, mediaId: row.id }, "[purgePendingMediaDeleteBatch] s3 delete failed");
        continue;
      }

      const del = await runWebappSql(
        db,
        sql`DELETE FROM media_files WHERE id = ${row.id}::uuid AND ${mediaS3PurgeStatusPredicate}`,
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

  const orphan = await runWebappSql(
    getWebappSqlDb(),
    sql`DELETE FROM media_files WHERE ${mediaS3PurgeStatusPredicate} AND (s3_key IS NULL OR trim(s3_key) = '')`,
  );
  removed += orphan.rowCount ?? 0;

  return { removed, errors };
}
