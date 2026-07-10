/** Max object size for legacy HLS reconcile / backfill batches (matches host reconcile route cap). */
export const VIDEO_HLS_LEGACY_MAX_OBJECT_BYTES = 3 * 1024 * 1024 * 1024;

/** Readable library rows for SQL alias `alias` (typically `media_files` query alias). */
export function mediaReadableSql(tableAlias: string): string {
  const a = tableAlias;
  return `(${a}.status IS NULL OR ${a}.status NOT IN ('pending', 'deleting', 'pending_delete'))`;
}

/** Readable library rows (alias `m`). @deprecated Prefer `mediaReadableSql("m")` for clarity. */
export const MEDIA_READABLE_SQL_M = mediaReadableSql("m");

/**
 * WHERE clause fragment (without cursor/cutoff/limit) aligned with legacy reconcile candidate selection.
 * Use the same alias in `FROM media_files <alias>` and in {@link legacyHlsReconcileEligibleForEnqueueSqlFilter}
 * (`size_bytes` cap applies only to enqueue / health COUNT semantics).
 */
export function legacyHlsBackfillCandidateWhereClause(tableAlias: string, includeFailed: boolean): string {
  const m = tableAlias;
  const readable = mediaReadableSql(m);
  const statusMatch = includeFailed
    ? `(
        (
          (${m}.video_processing_status IS NULL OR ${m}.video_processing_status = 'none')
          AND (${m}.hls_master_playlist_s3_key IS NULL OR trim(${m}.hls_master_playlist_s3_key) = '')
        )
        OR (${m}.video_processing_status = 'failed')
      )`
    : `(
        (${m}.video_processing_status IS NULL OR ${m}.video_processing_status = 'none')
        AND (${m}.hls_master_playlist_s3_key IS NULL OR trim(${m}.hls_master_playlist_s3_key) = '')
      )`;
  return `
    ${m}.mime_type ILIKE 'video/%'
    AND ${readable}
    AND ${m}.s3_key IS NOT NULL AND trim(${m}.s3_key) <> ''
    AND NOT (
      ${m}.video_processing_status = 'ready'
      AND ${m}.hls_master_playlist_s3_key IS NOT NULL
      AND trim(${m}.hls_master_playlist_s3_key) <> ''
    )
    AND NOT EXISTS (
      SELECT 1 FROM media_transcode_jobs j
      WHERE j.media_id = ${m}.id AND j.status IN ('pending', 'processing')
    )
    AND ${statusMatch}
  `
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extra filter applied when counting / enqueueing reconcile candidates beyond SQL batch fetch:
 * objects over the cap are skipped in the JS loop (`runVideoHlsLegacyBackfill`) — mirror in SQL COUNT.
 */
export function legacyHlsReconcileEligibleForEnqueueSqlFilter(tableAlias: string, maxSizeBytes: number): string {
  const m = tableAlias;
  return `(${m}.size_bytes IS NULL OR ${m}.size_bytes <= ${maxSizeBytes}::bigint)`;
}
