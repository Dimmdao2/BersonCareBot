/** Max object size for legacy HLS reconcile / backfill batches (matches host reconcile route cap). */
export const VIDEO_HLS_LEGACY_MAX_OBJECT_BYTES = 3 * 1024 * 1024 * 1024;

/** Readable library rows for SQL alias `alias` (typically `media_files` query alias). */
export function mediaReadableSql(tableAlias: string): string {
  const a = tableAlias;
  return `(${a}.status IS NULL OR ${a}.status NOT IN ('pending', 'deleting', 'pending_delete'))`;
}

/** Readable library rows (alias `m`). @deprecated Prefer `mediaReadableSql("m")` for clarity. */
export const MEDIA_READABLE_SQL_M = mediaReadableSql('m');

/**
 * WHERE clause fragment (without cursor/cutoff/limit) aligned with legacy reconcile candidate selection.
 * Use the same alias in `FROM media_files <alias>` and in {@link legacyHlsReconcileEligibleForEnqueueSqlFilter}
 * (`size_bytes` cap applies only to enqueue / health COUNT semantics).
 *
 * «Уже в очереди?» здесь НЕ спрашивается. Раньше тут стоял `NOT EXISTS (… media_transcode_jobs …)`,
 * и он был слеп: очередь принадлежит инфра-роли, ни `app_operational_media_worker` (под которым идёт
 * reconcile), ни `app_staff` (под которым идёт админская метрика) читать её отношением не могут.
 * Замер на bcb_webapp_dev 19.08: до миграции 0050 подзапрос молча возвращал ноль строк, после неё —
 * `42501 permission denied for table media_transcode_jobs`, и весь тик отвечал 500.
 *
 * Правило при этом не потеряно и не раздвоено: «эта работа уже в очереди» знает и отвечает
 * ЕДИНСТВЕННЫЙ хозяин очереди — корень постановки `app.enqueue_media_transcode_job_core`, и его
 * ответ приходит в отчёт тика полем `alreadyQueued`. Для обычной ветки подзапрос был вдобавок
 * избыточен: у файла с активной работой `video_processing_status = 'pending'`, а такой файл уже
 * отсекает `statusMatch`.
 */
export function legacyHlsBackfillCandidateWhereClause(
  tableAlias: string,
  includeFailed: boolean,
): string {
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
    AND ${statusMatch}
  `
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extra filter applied when counting / enqueueing reconcile candidates beyond SQL batch fetch:
 * objects over the cap are skipped in the JS loop (`runVideoHlsLegacyBackfill`) — mirror in SQL COUNT.
 */
export function legacyHlsReconcileEligibleForEnqueueSqlFilter(
  tableAlias: string,
  maxSizeBytes: number,
): string {
  const m = tableAlias;
  return `(${m}.size_bytes IS NULL OR ${m}.size_bytes <= ${maxSizeBytes}::bigint)`;
}
