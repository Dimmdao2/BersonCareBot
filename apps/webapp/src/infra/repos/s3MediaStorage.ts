import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { toIsoStringSafe } from '@/shared/lib/toIsoStringSafe';
import { and, asc, eq, lte, notExists, sql, type SQL } from 'drizzle-orm';
import {
  getCurrentDbPrincipal,
  getCurrentDbPrincipalOrganizationId,
} from '@bersoncare/db-principal';
import { env } from '@/config/env';
import { getPool } from '@/infra/db/client';
import { runDrizzleMutationTransaction } from '@/infra/db/drizzleMutationTx';
import { startPoolTransaction, withPoolTransaction } from '@/infra/db/withClient';
import { pgSessionAdvisoryLock, pgSessionAdvisoryUnlock } from '@/infra/db/pgAdvisoryLock';
import {
  getWebappSqlDb,
  getWebappSqlFromPgClient,
  runWebappNamedRoot,
  runWebappSql,
} from '@/infra/db/runWebappSql';
import { logger } from '@/infra/logging/logger';
import {
  pgCreateFolder,
  pgDeleteFolderIfEmpty,
  pgListAllFolders,
  pgListFolders,
  pgMoveFolder,
  pgRenameFolder,
} from '@/infra/repos/mediaFoldersRepo';
import { clientFilesSubtreeFolderIdsSql } from '@/infra/repos/pgClientMediaFolders';
import { mediaFolderExists } from '@/infra/repos/pgMediaFolderLookup';
import { pgMediaUsageSummaryForMediaId } from '@/infra/repos/pgMediaUsageSummary';
import {
  s3DeleteObject,
  s3ListObjectKeysUnderPrefix,
  s3ObjectKey,
  s3PublicUrl,
  s3PutObjectBody,
} from '@/infra/s3/client';
import type { MediaStoragePort } from '@/modules/media/ports';
import { assertReceivedUpload, type ReceivedUpload } from '@/modules/media/uploadValidation';
import { MAX_MEDIA_BYTES } from '@/modules/media/uploadAllowedMime';
import type {
  MediaListParams,
  MediaPreviewStatus,
  MediaRecord,
  MediaUsageRef,
} from '@/modules/media/types';
import {
  parseAvailableQualitiesJson,
  parseVideoDeliveryOverride,
  parseVideoProcessingStatus,
} from '@/modules/media/videoHlsFields';
import { mediaPreviewUrlById } from '@/shared/lib/mediaPreviewUrls';
import {
  isTrustedHlsArtifactS3Key,
  isTrustedPosterS3Key,
  resolveHlsPurgeListPrefix,
  resolvePosterPurgeListPrefix,
} from '@/shared/lib/hlsStorageLayout';
import { pgRuSubstringSearchPattern } from '@/shared/lib/ruSearchNormalize';
import { mediaFiles, mediaUploadSessions } from '../../../db/schema/schema';
import { patientFiles } from '../../../db/schema/patientFiles';
import { MULTIPART_SESSION_TTL_MS } from '@/modules/media/multipartConstants';
import {
  mediaReadableStatusPredicate,
  mediaReadableStatusPredicateM,
  mediaS3PurgeStatusPredicate,
} from '@/infra/repos/mediaSqlPredicates';

export {
  MEDIA_READABLE_STATUS_SQL,
  MEDIA_READABLE_STATUS_SQL_M,
  MEDIA_S3_PURGE_STATUS_SQL,
} from '@/infra/repos/mediaSqlPredicates';

function mediaAppUrl(mediaId: string): string {
  return `/api/media/${mediaId}`;
}

function currentPrincipalOrganizationId(): string {
  const principalOrganizationId = getCurrentDbPrincipalOrganizationId();
  if (!principalOrganizationId) {
    throw new Error('organization_principal_required');
  }
  return principalOrganizationId;
}

function kindFromMime(mimeType: string): MediaRecord['kind'] {
  const lower = mimeType.toLowerCase();
  if (lower.startsWith('image/')) return 'image';
  if (lower.startsWith('audio/')) return 'audio';
  if (lower.startsWith('video/')) return 'video';
  return 'file';
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
      assertReceivedUpload(params.received);
      const body =
        params.body instanceof ArrayBuffer ? params.body : new Uint8Array(params.body).buffer;
      if (body.byteLength > MAX_MEDIA_BYTES) {
        throw new Error('media_upload_too_large');
      }
      if (body.byteLength === 0) {
        throw new Error('media_upload_empty');
      }

      const id = randomUUID();
      const key = s3ObjectKey(id, params.filename);
      const folderId = params.folderId ?? null;
      const organizationId = currentPrincipalOrganizationId();
      await getWebappSqlDb()
        .insert(mediaFiles)
        .values({
          id,
          originalName: params.filename,
          storedPath: key,
          s3Key: key,
          mimeType: params.mimeType,
          sizeBytes: body.byteLength,
          status: 'pending',
          uploadedBy: params.userId ?? null,
          folderId,
          organizationId,
        });

      const buf = Buffer.from(body);
      await s3PutObjectBody(key, buf, params.mimeType);

      const ready = await getWebappSqlDb()
        .update(mediaFiles)
        .set({ status: 'ready' })
        .where(
          and(
            eq(mediaFiles.id, id),
            eq(mediaFiles.organizationId, organizationId),
            eq(mediaFiles.status, 'pending'),
          ),
        )
        .returning({ id: mediaFiles.id });
      if (ready.length !== 1) {
        throw new Error('media_upload_commit_failed');
      }

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
      const organizationId = currentPrincipalOrganizationId();
      const patientRead = getCurrentDbPrincipal()?.kind === 'patient';
      const query = patientRead
        ? sql`SELECT m.id, m.original_name, m.display_name, m.mime_type, m.size_bytes, m.uploaded_by,
            NULL::text AS uploaded_by_name,
            m.created_at,
            m.preview_status, m.preview_sm_key, m.preview_md_key, m.standard_rendition_at,
            m.source_width, m.source_height,
            m.video_processing_status, m.video_processing_error,
            m.hls_master_playlist_s3_key, m.hls_artifact_prefix, m.poster_s3_key,
            m.video_duration_seconds, m.available_qualities_json, m.video_delivery_override
         FROM media_files m
         WHERE m.id = ${id}::uuid
           AND m.organization_id = ${organizationId}::uuid
           AND ${mediaReadableStatusPredicateM}`
        : sql`SELECT m.id, m.original_name, m.display_name, m.mime_type, m.size_bytes, m.uploaded_by,
            COALESCE(
              NULLIF(TRIM(CONCAT_WS(' ', COALESCE(ui.first_name, pu.first_name), COALESCE(ui.last_name, pu.last_name))), ''),
              NULLIF(TRIM(COALESCE(ui.display_name, pu.display_name)), '')
            ) AS uploaded_by_name,
            m.created_at,
            m.preview_status, m.preview_sm_key, m.preview_md_key, m.standard_rendition_at,
            m.source_width, m.source_height,
            m.video_processing_status, m.video_processing_error,
            m.hls_master_playlist_s3_key, m.hls_artifact_prefix, m.poster_s3_key,
            m.video_duration_seconds, m.available_qualities_json, m.video_delivery_override
         FROM media_files m
         LEFT JOIN platform_users pu ON pu.id = m.uploaded_by
         LEFT JOIN user_identity ui ON ui.platform_user_id = pu.id
         WHERE m.id = ${id}::uuid
           AND m.organization_id = ${organizationId}::uuid
           AND ${mediaReadableStatusPredicateM}`;
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
        standard_rendition_at: string | Date | null;
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
        query,
      );
      const row = res.rows[0];
      if (!row) return null;
      const previewStatus = (row.preview_status ?? 'pending') as MediaPreviewStatus;
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
        previewSmUrl: row.preview_sm_key?.trim() ? mediaPreviewUrlById(row.id, 'sm') : null,
        previewMdUrl: row.preview_md_key?.trim() ? mediaPreviewUrlById(row.id, 'md') : null,
        standardRendition: row.standard_rendition_at != null,
        sourceWidth: row.source_width ?? null,
        sourceHeight: row.source_height ?? null,
        ...mapVideoHlsColumns(row),
      };
    },

    async getUrl(id: string) {
      const organizationId = currentPrincipalOrganizationId();
      const res = await runWebappSql<{ s3_key: string }>(
        getWebappSqlDb(),
        sql`SELECT s3_key FROM media_files
         WHERE id = ${id}::uuid AND s3_key IS NOT NULL
           AND organization_id = ${organizationId}::uuid
           AND ${mediaReadableStatusPredicate}`,
      );
      const row = res.rows[0];
      if (!row) return null;
      return mediaAppUrl(id);
    },

    async list(params: MediaListParams) {
      const organizationId = currentPrincipalOrganizationId();
      const whereParts: SQL[] = [
        mediaReadableStatusPredicateM,
        sql`m.organization_id = ${organizationId}::uuid`,
      ];

      if (params.kind && params.kind !== 'all') {
        if (params.kind === 'file') {
          whereParts.push(
            sql`NOT (m.mime_type LIKE 'image/%' OR m.mime_type LIKE 'video/%' OR m.mime_type LIKE 'audio/%')`,
          );
        } else if (params.kind === 'image') {
          whereParts.push(sql`m.mime_type LIKE 'image/%'`);
        } else if (params.kind === 'video') {
          whereParts.push(sql`m.mime_type LIKE 'video/%'`);
        } else if (params.kind === 'audio') {
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
      } else if (params.excludeClientFiles !== false) {
        whereParts.push(
          sql`(m.folder_id IS NULL OR m.folder_id NOT IN ${clientFilesSubtreeFolderIdsSql()})`,
        );
      }

      const whereSql = sql.join(whereParts, sql` AND `);
      const sortDir = params.sortDir === 'asc' ? sql`ASC` : sql`DESC`;
      const nameSortKey = sql`LOWER(COALESCE(NULLIF(TRIM(m.display_name), ''), m.original_name))`;
      const orderBy =
        params.sortBy === 'name'
          ? sql`CASE
               WHEN ${nameSortKey} ~ '^[0-9]' THEN 0
               WHEN ${nameSortKey} ~ '^[a-z]' THEN 1
               WHEN ${nameSortKey} ~ '^[а-яё]' THEN 2
               ELSE 3
             END ${sortDir},
             ${nameSortKey} ${sortDir},
             m.id ${sortDir}`
          : params.sortBy === 'size'
            ? sql`m.size_bytes ${sortDir}, m.id ${sortDir}`
            : params.sortBy === 'kind'
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
        standard_rendition_at: string | Date | null;
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
              NULLIF(TRIM(CONCAT_WS(' ', COALESCE(ui.first_name, pu.first_name), COALESCE(ui.last_name, pu.last_name))), ''),
              NULLIF(TRIM(COALESCE(ui.display_name, pu.display_name)), '')
            ) AS uploaded_by_name,
            m.created_at, m.s3_key, m.folder_id,
            m.preview_status, m.preview_sm_key, m.preview_md_key, m.standard_rendition_at,
            m.source_width, m.source_height,
            m.video_processing_status, m.video_processing_error,
            m.hls_master_playlist_s3_key, m.hls_artifact_prefix, m.poster_s3_key,
            m.video_duration_seconds, m.available_qualities_json, m.video_delivery_override,
            COUNT(*) OVER()::text AS total_count
         FROM media_files m
         LEFT JOIN platform_users pu ON pu.id = m.uploaded_by
         LEFT JOIN user_identity ui ON ui.platform_user_id = pu.id
         WHERE ${whereSql} AND m.s3_key IS NOT NULL
         ORDER BY ${orderBy}
         LIMIT ${limit} OFFSET ${offset}`,
      );

      const total = res.rows.length > 0 ? Number(res.rows[0]!.total_count) : 0;
      const items = res.rows.map((row) => {
        const previewStatus = (row.preview_status ?? 'pending') as MediaPreviewStatus;
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
          previewSmUrl: row.preview_sm_key?.trim() ? mediaPreviewUrlById(row.id, 'sm') : null,
          previewMdUrl: row.preview_md_key?.trim() ? mediaPreviewUrlById(row.id, 'md') : null,
          standardRendition: row.standard_rendition_at != null,
          sourceWidth: row.source_width ?? null,
          sourceHeight: row.source_height ?? null,
          ...mapVideoHlsColumns(row),
        };
      });
      return { items, total };
    },

    async updateDisplayName(mediaId: string, displayName: string | null) {
      const organizationId = currentPrincipalOrganizationId();
      const normalized = displayName?.trim() || null;
      const res = await runWebappSql(
        getWebappSqlDb(),
        sql`UPDATE media_files m
            SET organization_id = ${organizationId}::uuid,
                display_name = ${normalized}
          WHERE m.id = ${mediaId}::uuid
            AND m.organization_id = ${organizationId}::uuid
            AND ${mediaReadableStatusPredicateM}`,
      );
      return (res.rowCount ?? 0) > 0;
    },

    async updateMediaFolder(mediaId: string, folderId: string | null) {
      const organizationId = currentPrincipalOrganizationId();
      const res = await runWebappSql(
        getWebappSqlDb(),
        sql`UPDATE media_files m
            SET organization_id = ${organizationId}::uuid,
                folder_id = ${folderId}
          WHERE m.id = ${mediaId}::uuid
            AND m.organization_id = ${organizationId}::uuid
            AND (
              ${folderId}::uuid IS NULL
              OR EXISTS (
                SELECT 1
                  FROM media_folders f
                 WHERE f.id = ${folderId}::uuid
                   AND f.organization_id = ${organizationId}::uuid
              )
            )
            AND ${mediaReadableStatusPredicateM}`,
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
      const organizationId = currentPrincipalOrganizationId();
      const mediaUrl = `/api/media/${mediaId}`;
      const keyRes = await runWebappSql<{ s3_key: string | null }>(
        getWebappSqlDb(),
        sql`SELECT s3_key FROM media_files
             WHERE id = ${mediaId}::uuid
               AND organization_id = ${organizationId}::uuid`,
      );
      const s3Key = keyRes.rows[0]?.s3_key ?? null;
      const publicUrl = s3Key && env.S3_PUBLIC_BUCKET ? s3PublicUrl(s3Key) : null;

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
          WHERE body_html LIKE ${`%${mediaUrl}%`} OR (${publicUrl}::text IS NOT NULL AND body_html LIKE ${publicUrl ? `%${publicUrl}%` : null})
         UNION ALL
         SELECT m.id::text AS "pageId",
                ('program_item_discussion:' || m.instance_stage_item_id::text) AS "pageSlug",
                'program_item_discussion_media_only'::text AS field
           FROM program_item_discussion_messages m
          WHERE m.media_file_id = ${mediaId}::uuid
            AND m.body IS NULL`,
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
      const organizationId = currentPrincipalOrganizationId();
      const pool = getPool();
      return withPoolTransaction(pool, async (client) => {
        await pgSessionAdvisoryLock(client, mediaId);
        try {
          const db = getWebappSqlFromPgClient(client);
          const sel = await runWebappSql<{ s3_key: string | null; status: string | null }>(
            db,
            sql`SELECT s3_key, status
                  FROM media_files
                 WHERE id = ${mediaId}::uuid
                   AND organization_id = ${organizationId}::uuid`,
          );
          const row = sel.rows[0];
          if (!row) return false;

          if (row.status === 'pending_delete') {
            await db
              .delete(patientFiles)
              .where(
                and(
                  eq(patientFiles.mediaFileId, mediaId),
                  eq(patientFiles.organizationId, organizationId),
                ),
              );
            return true;
          }

          if (!row.s3_key) {
            await db
              .delete(patientFiles)
              .where(
                and(
                  eq(patientFiles.mediaFileId, mediaId),
                  eq(patientFiles.organizationId, organizationId),
                ),
              );
            const del = await runWebappSql(
              db,
              sql`DELETE FROM media_files
                   WHERE id = ${mediaId}::uuid
                     AND organization_id = ${organizationId}::uuid`,
            );
            return (del.rowCount ?? 0) > 0;
          }

          await runWebappSql(
            db,
            sql`UPDATE media_files
                   SET organization_id = ${organizationId}::uuid,
                       status = 'pending_delete'
               WHERE id = ${mediaId}::uuid
                   AND organization_id = ${organizationId}::uuid`,
          );
          await db
            .delete(patientFiles)
            .where(
              and(
                eq(patientFiles.mediaFileId, mediaId),
                eq(patientFiles.organizationId, organizationId),
              ),
            );
          return true;
        } finally {
          await pgSessionAdvisoryUnlock(client, mediaId);
        }
      });
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
  const organizationId = currentPrincipalOrganizationId();
  const db = getWebappSqlFromPgClient(client);
  await db.insert(mediaFiles).values({
    id: params.id,
    originalName: params.filename,
    storedPath: params.key,
    s3Key: params.key,
    mimeType: params.mimeType,
    sizeBytes: params.sizeBytes,
    status: 'pending',
    uploadedBy: params.userId,
    folderId: params.folderId ?? null,
    organizationId,
  });
}

/** Exact patient-context root: ensure the patient folder and insert one pending submission. */
export async function createPendingProgramSubmissionMediaFile(
  params: {
    id: string;
    filename: string;
    key: string;
    mimeType: string;
    sizeBytes: number;
  },
): Promise<boolean> {
  const args = [params.id, params.filename, params.key, params.mimeType, params.sizeBytes] as const;
  const result = await runWebappNamedRoot<{ created: boolean }>(
    getWebappSqlDb(),
    'app.create_patient_program_submission_media(uuid,text,text,text,bigint)',
    args,
    sql`SELECT app.create_patient_program_submission_media(
      ${params.id}::uuid,
      ${params.filename}::text,
      ${params.key}::text,
      ${params.mimeType}::text,
      ${params.sizeBytes}::bigint
    ) AS created`,
  );
  return result.rows[0]?.created === true;
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
  const organizationId = currentPrincipalOrganizationId();
  await getWebappSqlDb()
    .insert(mediaFiles)
    .values({
      id: params.id,
      originalName: params.filename,
      storedPath: params.key,
      s3Key: params.key,
      mimeType: params.mimeType,
      sizeBytes: params.sizeBytes,
      status: 'pending',
      uploadedBy: params.userId,
      folderId: params.folderId ?? null,
      organizationId,
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
  original_name: string;
  usage_purpose: string | null;
  size_bytes: number | null;
} | null> {
  const organizationId = currentPrincipalOrganizationId();
  const res = await runWebappSql<{
    s3_key: string | null;
    status: string;
    mime_type: string;
    original_name: string;
    usage_purpose: string | null;
    size_bytes: string | null;
  }>(
    getWebappSqlDb(),
    sql`SELECT s3_key, status, mime_type, original_name, usage_purpose, size_bytes::text
     FROM media_files
     WHERE id = ${mediaId}::uuid
       AND organization_id = ${organizationId}::uuid
       AND uploaded_by = ${userId}::uuid`,
  );
  const row = res.rows[0];
  if (!row) return null;
  const sizeRaw = row.size_bytes != null ? Number(row.size_bytes) : null;
  return {
    s3_key: row.s3_key,
    status: row.status,
    mime_type: row.mime_type,
    original_name: row.original_name,
    usage_purpose: row.usage_purpose,
    size_bytes: sizeRaw != null && Number.isFinite(sizeRaw) ? sizeRaw : null,
  };
}

/** Only the received-object door may transition a pending row to ready. */
export async function confirmMediaFileReady(
  mediaId: string,
  received: ReceivedUpload,
): Promise<boolean> {
  assertReceivedUpload(received);
  const organizationId = currentPrincipalOrganizationId();
  const rows = await getWebappSqlDb()
    .update(mediaFiles)
    .set({ status: 'ready' })
    .where(
      and(
        eq(mediaFiles.id, mediaId),
        eq(mediaFiles.organizationId, organizationId),
        eq(mediaFiles.status, 'pending'),
      ),
    )
    .returning({ id: mediaFiles.id });
  return rows.length > 0;
}

/** Confirm patient program submission upload (must have usage_purpose set at presign). */
export async function confirmProgramSubmissionMediaFileReady(
  mediaId: string,
  received: ReceivedUpload,
): Promise<boolean> {
  assertReceivedUpload(received);
  const res = await runWebappNamedRoot<{ confirmed: boolean }>(
    getWebappSqlDb(),
    'app.confirm_patient_program_submission_media(uuid)',
    [mediaId],
    sql`SELECT app.confirm_patient_program_submission_media(${mediaId}::uuid) AS confirmed`,
  );
  return res.rows[0]?.confirmed === true;
}

/** Exact patient-context terminal transition; never touches the unrelated patient_files table. */
export async function abortPendingProgramSubmissionMedia(mediaId: string): Promise<boolean> {
  const res = await runWebappNamedRoot<{ aborted: boolean }>(
    getWebappSqlDb(),
    'app.abort_patient_program_submission_media(uuid)',
    [mediaId],
    sql`SELECT app.abort_patient_program_submission_media(${mediaId}::uuid) AS aborted`,
  );
  return res.rows[0]?.aborted === true;
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
  const organizationId = currentPrincipalOrganizationId();
  const res = await runWebappSql<ProgramSubmissionMediaStatusRow>(
    getWebappSqlDb(),
    sql`SELECT id::text, mime_type, status, video_processing_status, video_processing_error
     FROM media_files
     WHERE id = ${mediaId}::uuid
       AND organization_id = ${organizationId}::uuid
       AND uploaded_by = ${patientUserId}::uuid
       AND usage_purpose = 'program_item_submission'`,
  );
  return res.rows[0] ?? null;
}

export function isProgramSubmissionMediaAttachReady(row: ProgramSubmissionMediaStatusRow): boolean {
  if (row.status !== 'ready') return false;
  if (!row.mime_type.toLowerCase().startsWith('video/')) return true;
  return row.video_processing_status === 'ready';
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

export type MediaAccessRow = {
  usage_purpose: string | null;
  uploaded_by: string;
  mime_type: string;
  stored_path: string;
  s3_key: string | null;
};

/**
 * Platform exercise-library media bridge (deploy/postgres migration
 * 0250_c4d_platform_library_read_staff_scope.sql). app_patient (and therefore the anonymous
 * bootstrap connection) has no ambient RLS visibility into owner_kind = 'platform' rows on
 * media_files any more -- `c4d_platform_library_read` is scoped `TO app_staff`. This is the one
 * legitimate non-staff read path (a doctor or patient viewing a platform exercise's media once
 * apps/webapp/src/app-layer/media/resolvePlatformLfkMediaAccess.ts has already confirmed
 * entitlement), so it goes through the narrow SECURITY DEFINER accessor instead of an ambient
 * SELECT. Callers MUST have already confirmed entitlement -- this function does not check it.
 */
type PlatformMediaRow = {
  id: string;
  mime_type: string;
  s3_key: string | null;
  stored_path: string;
  status: string | null;
  usage_purpose: string | null;
  uploaded_by: string;
  video_processing_status: string | null;
  hls_master_playlist_s3_key: string | null;
  poster_s3_key: string | null;
  video_duration_seconds: number | null;
  available_qualities_json: unknown;
  video_delivery_override: string | null;
  preview_sm_key: string | null;
  preview_md_key: string | null;
  preview_status: string | null;
};

async function readPlatformMediaRow(id: string): Promise<PlatformMediaRow | null> {
  const res = await runWebappSql<PlatformMediaRow>(
    getWebappSqlDb(),
    sql`SELECT * FROM app.read_platform_media_row(${id}::uuid)`,
  );
  return res.rows[0] ?? null;
}

export async function getMediaAccessRow(
  id: string,
  options: { allowPlatformBase?: boolean } = {},
): Promise<MediaAccessRow | null> {
  const organizationId = currentPrincipalOrganizationId();
  const res = await runWebappSql<MediaAccessRow>(
    getWebappSqlDb(),
    sql`SELECT usage_purpose, uploaded_by::text, mime_type, stored_path, s3_key
     FROM media_files
     WHERE id = ${id}::uuid
       AND owner_kind = 'organization' AND organization_id = ${organizationId}::uuid
       AND ${mediaReadableStatusPredicate}`,
  );
  if (res.rows[0]) return res.rows[0];
  if (options.allowPlatformBase !== true) return null;
  const platformRow = await readPlatformMediaRow(id);
  if (!platformRow) return null;
  return {
    usage_purpose: platformRow.usage_purpose,
    uploaded_by: platformRow.uploaded_by,
    mime_type: platformRow.mime_type,
    stored_path: platformRow.stored_path,
    s3_key: platformRow.s3_key,
  };
}

/** Roll back presign INSERT when presigned URL generation fails. */
export async function deletePendingMediaFileById(mediaId: string): Promise<boolean> {
  const organizationId = currentPrincipalOrganizationId();
  const rows = await getWebappSqlDb()
    .delete(mediaFiles)
    .where(
      and(
        eq(mediaFiles.id, mediaId),
        eq(mediaFiles.organizationId, organizationId),
        eq(mediaFiles.status, 'pending'),
      ),
    )
    .returning({ id: mediaFiles.id });
  return rows.length > 0;
}

/**
 * The common terminal-upload transition. A durable media lifecycle record is retained for
 * S3-first purge/retry; linked pending patient-file metadata is removed in the same transaction
 * so the nullable FK cannot later surface it as a legacy file.
 */
export async function stagePendingMediaAbort(mediaId: string): Promise<boolean> {
  const organizationId = currentPrincipalOrganizationId();
  return runDrizzleMutationTransaction(async (tx) => {
    const staged = await tx
      .update(mediaFiles)
      .set({ status: 'pending_delete' })
      .where(
        and(
          eq(mediaFiles.id, mediaId),
          eq(mediaFiles.organizationId, organizationId),
          eq(mediaFiles.status, 'pending'),
        ),
      )
      .returning({ id: mediaFiles.id });
    if (staged.length === 0) return false;

    await tx
      .delete(patientFiles)
      .where(
        and(eq(patientFiles.mediaFileId, mediaId), eq(patientFiles.organizationId, organizationId)),
      );
    return true;
  });
}

/**
 * Claims abandoned direct-to-S3 uploads before the existing pending-delete batch runs.
 * Multipart-backed rows are deliberately left to their session lifecycle, even after the TTL.
 */
export async function stageStaleSinglePutMediaForPurge(limit: number): Promise<number> {
  const take = Math.max(1, Math.min(50, limit));
  const cutoff = new Date(Date.now() - MULTIPART_SESSION_TTL_MS).toISOString();

  return runDrizzleMutationTransaction(async (tx) => {
    const sessionExists = () =>
      tx
        .select({ id: mediaUploadSessions.id })
        .from(mediaUploadSessions)
        .where(eq(mediaUploadSessions.mediaId, mediaFiles.id));
    const candidates = await tx
      .select({ id: mediaFiles.id })
      .from(mediaFiles)
      .where(
        and(
          eq(mediaFiles.status, 'pending'),
          lte(mediaFiles.createdAt, cutoff),
          notExists(sessionExists()),
        ),
      )
      .orderBy(asc(mediaFiles.createdAt))
      .limit(take);

    let staged = 0;
    for (const candidate of candidates) {
      const changed = await tx
        .update(mediaFiles)
        .set({ status: 'pending_delete' })
        .where(
          and(
            eq(mediaFiles.id, candidate.id),
            eq(mediaFiles.status, 'pending'),
            lte(mediaFiles.createdAt, cutoff),
            notExists(sessionExists()),
          ),
        )
        .returning({ id: mediaFiles.id });
      staged += changed.length;
    }
    return staged;
  });
}

export type MediaDeleteErrorRow = {
  id: string;
  original_name: string;
  delete_attempts: number;
  next_attempt_at: string | null;
  created_at: string;
};

/** Admin: rows stuck in delete queue with at least one failed S3 attempt. */
export async function listMediaDeleteErrors(
  limit: number = 100,
): Promise<{ items: MediaDeleteErrorRow[]; total: number }> {
  const organizationId = currentPrincipalOrganizationId();
  const cap = Math.min(100, Math.max(1, limit));
  const countRes = await runWebappSql<{ c: string }>(
    getWebappSqlDb(),
    sql`SELECT count(*)::text AS c FROM media_files
     WHERE organization_id = ${organizationId}::uuid
       AND status IN ('pending_delete', 'deleting') AND COALESCE(delete_attempts, 0) > 0`,
  );
  const total = Number.parseInt(countRes.rows[0]?.c ?? '0', 10);
  const res = await runWebappSql<MediaDeleteErrorRow>(
    getWebappSqlDb(),
    sql`SELECT id::text, original_name, COALESCE(delete_attempts, 0)::int AS delete_attempts,
            next_attempt_at::text, created_at::text
       FROM media_files
      WHERE organization_id = ${organizationId}::uuid
        AND status IN ('pending_delete', 'deleting') AND COALESCE(delete_attempts, 0) > 0
      ORDER BY delete_attempts DESC, id ASC
      LIMIT ${cap}`,
  );
  return { items: res.rows, total };
}

/** Row for `GET /api/media/[id]/playback` (JSON + presign HLS master / poster). */
export type MediaPlaybackRow = {
  id: string;
  mime_type: string;
  s3_key: string | null;
  stored_path: string;
  video_processing_status: string | null;
  hls_master_playlist_s3_key: string | null;
  poster_s3_key: string | null;
  preview_sm_key: string | null;
  preview_md_key: string | null;
  preview_status: string | null;
  /** NULL = the object at `s3_key` is still the raw upload; never inferred from key or mime. */
  standard_rendition_at: string | Date | null;
  video_duration_seconds: number | null;
  available_qualities_json: unknown;
  video_delivery_override: string | null;
  usage_purpose: string | null;
  uploaded_by: string;
};

export async function getMediaRowForPlayback(
  id: string,
  options: { allowLocalSaasTestFixture?: boolean; allowPlatformBase?: boolean } = {},
): Promise<MediaPlaybackRow | null> {
  const organizationId = currentPrincipalOrganizationId();
  const storagePredicate = options.allowLocalSaasTestFixture
    ? sql`((s3_key IS NOT NULL AND length(trim(s3_key)) > 0) OR (s3_key IS NULL AND stored_path = '/test-fixtures/saas-exercise.svg'))`
    : sql`(s3_key IS NOT NULL AND length(trim(s3_key)) > 0)`;
  const res = await runWebappSql<MediaPlaybackRow>(
    getWebappSqlDb(),
    sql`SELECT id::text, mime_type, s3_key, stored_path,
            video_processing_status, hls_master_playlist_s3_key, poster_s3_key,
            preview_sm_key, preview_md_key, preview_status, standard_rendition_at,
            video_duration_seconds, available_qualities_json, video_delivery_override,
            usage_purpose, uploaded_by::text
     FROM media_files
     WHERE id = ${id}::uuid AND ${storagePredicate}
       AND owner_kind = 'organization' AND organization_id = ${organizationId}::uuid
       AND ${mediaReadableStatusPredicate}`,
  );
  if (res.rows[0]) return res.rows[0];
  if (options.allowPlatformBase !== true) return null;
  const platformRow = await readPlatformMediaRow(id);
  if (!platformRow) return null;
  const hasStorage = options.allowLocalSaasTestFixture
    ? (platformRow.s3_key != null && platformRow.s3_key.trim().length > 0) ||
      (platformRow.s3_key == null && platformRow.stored_path === '/test-fixtures/saas-exercise.svg')
    : platformRow.s3_key != null && platformRow.s3_key.trim().length > 0;
  if (!hasStorage) return null;
  return {
    id: platformRow.id,
    mime_type: platformRow.mime_type,
    s3_key: platformRow.s3_key,
    stored_path: platformRow.stored_path,
    video_processing_status: platformRow.video_processing_status,
    hls_master_playlist_s3_key: platformRow.hls_master_playlist_s3_key,
    poster_s3_key: platformRow.poster_s3_key,
    preview_sm_key: platformRow.preview_sm_key,
    preview_md_key: platformRow.preview_md_key,
    preview_status: platformRow.preview_status,
    /* `app.read_platform_media_row` has no such column; unknown stays "not converted". */
    standard_rendition_at: null,
    video_duration_seconds: platformRow.video_duration_seconds,
    available_qualities_json: platformRow.available_qualities_json,
    video_delivery_override: platformRow.video_delivery_override,
    usage_purpose: platformRow.usage_purpose,
    uploaded_by: platformRow.uploaded_by,
  };
}

/** For GET /api/media/[id]: S3 key when row may be redirected (presigned GET to private bucket). */
export async function getMediaS3KeyForRedirect(
  id: string,
  options: { allowPlatformBase?: boolean } = {},
): Promise<string | null> {
  const organizationId = currentPrincipalOrganizationId();
  const res = await runWebappSql<{ s3_key: string | null }>(
    getWebappSqlDb(),
    sql`SELECT s3_key FROM media_files
         WHERE id = ${id}::uuid AND s3_key IS NOT NULL
           AND owner_kind = 'organization' AND organization_id = ${organizationId}::uuid
           AND ${mediaReadableStatusPredicate}`,
  );
  if (res.rows[0]?.s3_key) return res.rows[0].s3_key;
  if (options.allowPlatformBase !== true) return null;
  const platformRow = await readPlatformMediaRow(id);
  return platformRow?.s3_key ?? null;
}

/** Presigned-GET target for generated preview JPEG (sm/md). */
export async function getMediaPreviewS3KeyForRedirect(
  id: string,
  size: 'sm' | 'md',
  options: { allowPlatformBase?: boolean } = {},
): Promise<string | null> {
  const organizationId = currentPrincipalOrganizationId();
  const res = await runWebappSql<{
    preview_sm_key: string | null;
    preview_md_key: string | null;
    preview_status: string | null;
  }>(
    getWebappSqlDb(),
    sql`SELECT preview_sm_key, preview_md_key, preview_status
     FROM media_files
     WHERE id = ${id}::uuid
       AND owner_kind = 'organization' AND organization_id = ${organizationId}::uuid
       AND ${mediaReadableStatusPredicate}`,
  );
  const row =
    res.rows[0] ?? (options.allowPlatformBase === true ? await readPlatformMediaRow(id) : null);
  if (!row || row.preview_status !== 'ready') return null;
  const key = size === 'sm' ? row.preview_sm_key : row.preview_md_key;
  return key?.trim() ? key : null;
}

export type PurgePendingMediaDeleteBatchResult = {
  /** Rows fully removed (S3 delete + DB delete, or orphan cleanup). */
  removed: number;
  /** Rows where S3 delete failed in this run (retry scheduled). */
  errors: number;
};

function computeDeleteRetryDelayMinutes(previousAttempts: number): number {
  const exp = Math.min(previousAttempts + 1, 20);
  return Math.min(1440, Math.pow(2, exp));
}

async function schedulePendingDeleteRetry(
  db: ReturnType<typeof getWebappSqlFromPgClient>,
  mediaId: string,
  previousAttempts: number,
): Promise<void> {
  const minutes = computeDeleteRetryDelayMinutes(previousAttempts);
  await runWebappSql(
    db,
    sql`UPDATE media_files SET
       delete_attempts = delete_attempts + 1,
       next_attempt_at = now() + (${minutes}::numeric * interval '1 minute')
     WHERE id = ${mediaId}::uuid`,
  );
}

function readPgCode(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null;
  const e = err as { code?: unknown; cause?: { code?: unknown } };
  if (typeof e.code === 'string' && e.code.length > 0) return e.code;
  if (typeof e.cause?.code === 'string' && e.cause.code.length > 0) return e.cause.code;
  return null;
}

function readPgConstraint(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null;
  const e = err as { constraint?: unknown; cause?: { constraint?: unknown } };
  if (typeof e.constraint === 'string' && e.constraint.length > 0) return e.constraint;
  if (typeof e.cause?.constraint === 'string' && e.cause.constraint.length > 0)
    return e.cause.constraint;
  return null;
}

function isDeterministicDeleteConstraintFailure(err: unknown): boolean {
  const code = readPgCode(err);
  return typeof code === 'string' && code.startsWith('23');
}

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
        '[collectS3KeysForMediaPurge] skipped untrusted hls_master_playlist_s3_key',
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
        '[collectS3KeysForMediaPurge] skipped untrusted poster_s3_key; trying canonical poster prefix list',
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
  await stageStaleSinglePutMediaForPurge(take);
  let removed = 0;
  let errors = 0;

  for (let i = 0; i < take; i++) {
    const tx = await startPoolTransaction(pool);
    const client = tx.client;
    const db = getWebappSqlFromPgClient(client);
    try {
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
        await tx.commit();
        break;
      }

      const row = rows[0]!;
      if (row.status !== 'pending_delete' && row.status !== 'deleting') {
        await tx.rollback();
        continue;
      }

      let keysToDelete: string[];
      try {
        keysToDelete = await collectS3KeysForMediaPurge(row);
      } catch (e) {
        logger.error(
          { err: e, mediaId: row.id },
          '[purgePendingMediaDeleteBatch] failed to list keys',
        );
        await schedulePendingDeleteRetry(db, row.id, row.delete_attempts ?? 0);
        await tx.commit();
        errors += 1;
        continue;
      }

      try {
        for (const key of keysToDelete) {
          await s3DeleteObject(key);
        }
      } catch (e) {
        await schedulePendingDeleteRetry(db, row.id, row.delete_attempts ?? 0);
        await tx.commit();
        errors += 1;
        logger.error(
          { err: e, mediaId: row.id },
          '[purgePendingMediaDeleteBatch] s3 delete failed',
        );
        continue;
      }

      try {
        const del = await runWebappSql(
          db,
          sql`DELETE FROM media_files WHERE id = ${row.id}::uuid AND ${mediaS3PurgeStatusPredicate}`,
        );
        await tx.commit();
        if ((del.rowCount ?? 0) > 0) removed += 1;
      } catch (e) {
        if (!isDeterministicDeleteConstraintFailure(e)) {
          throw e;
        }
        await schedulePendingDeleteRetry(db, row.id, row.delete_attempts ?? 0);
        await tx.commit();
        errors += 1;
        logger.warn(
          {
            err: e,
            mediaId: row.id,
            pgCode: readPgCode(e),
            pgConstraint: readPgConstraint(e),
          },
          '[purgePendingMediaDeleteBatch] db delete blocked by data constraint; retry scheduled',
        );
        continue;
      }
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

  const orphan = await runWebappSql(
    getWebappSqlDb(),
    sql`DELETE FROM media_files WHERE ${mediaS3PurgeStatusPredicate} AND (s3_key IS NULL OR trim(s3_key) = '')`,
  );
  removed += orphan.rowCount ?? 0;

  return { removed, errors };
}
