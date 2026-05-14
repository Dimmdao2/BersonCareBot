/**
 * VIDEO_HLS_DELIVERY phase-07: batch enqueue transcode jobs for legacy library videos
 * (readable rows without HLS yet). Used by scripts/video-hls-backfill-legacy.ts.
 *
 * Dry-run: never calls enqueue — no writes to jobs/media via enqueue path. Final report uses
 * read-only SELECTs (`loadHistogram`, `loadFailedReasons`).
 */

import type { Pool } from "pg";
import { enqueueMediaTranscodeJob } from "@/app-layer/media/mediaTranscodeJobs";
import { getPool } from "@/infra/db/client";
import { getConfigBool } from "@/modules/system-settings/configAdapter";

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

export type VideoHlsLegacyBackfillOptions = {
  dryRun: boolean;
  /** Max candidate rows to scan this run (0 = use defaultCap). */
  limit: number;
  batchSize: number;
  sleepMsBetweenBatches: number;
  /** Resume after this media id (exclusive). */
  cursorAfterMediaId: string | null;
  /** Only media created strictly before this instant. */
  cutoffCreatedBefore: Date | null;
  /** Retry rows with video_processing_status = failed (still no active job). */
  includeFailed: boolean;
  maxSizeBytes: number;
  /** Abort if `video_hls_pipeline_enabled` is false (still allow dry-run with warning). */
  requirePipelineEnabled: boolean;
  /** Hard cap when limit=0. */
  defaultRunCap: number;
};

export type VideoHlsLegacyBackfillReport = {
  dryRun: boolean;
  pipelineEnabled: boolean | null;
  abortedReason: string | null;
  batches: number;
  candidatesScanned: number;
  skippedOversized: number;
  skippedPipelineOff: number;
  enqueue: {
    queuedNew: number;
    alreadyQueued: number;
    alreadyReady: number;
    notVideo: number;
    notReadable: number;
    noS3Key: number;
    notFound: number;
    errors: number;
  };
  /** Last media id processed (max id in last batch), for checkpointing. */
  lastMediaId: string | null;
  /** Snapshot: video rows by processing status (library-readable subset). */
  statusHistogram: { status: string; count: string }[];
  /** Top failed messages for diagnostics. */
  failedReasons: { video_processing_error: string | null; count: string }[];
};

const DEFAULT_RUN_CAP = 10_000;
const MAX_BATCH = 500;
const MAX_SLEEP_MS = 600_000;

export function clampBackfillBatchSize(n: number): number {
  if (!Number.isFinite(n) || n < 1) return 50;
  return Math.min(Math.floor(n), MAX_BATCH);
}

export function clampBackfillSleepMs(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.floor(n), MAX_SLEEP_MS);
}

function resolveEffectiveLimit(limit: number, defaultRunCap: number): number {
  const cap = defaultRunCap > 0 ? defaultRunCap : DEFAULT_RUN_CAP;
  if (limit > 0) return Math.min(limit, cap);
  return cap;
}

export async function fetchLegacyBackfillBatch(
  pool: Pool,
  opts: {
    batchSize: number;
    cursorAfterMediaId: string | null;
    cutoffCreatedBefore: Date | null;
    includeFailed: boolean;
  },
): Promise<{ id: string; size_bytes: string | null }[]> {
  const coreWhere = legacyHlsBackfillCandidateWhereClause("m", opts.includeFailed);
  const { rows } = await pool.query<{ id: string; size_bytes: string | null }>(
    `SELECT m.id::text AS id, m.size_bytes::text AS size_bytes
     FROM media_files m
     WHERE ${coreWhere}
       AND ($1::uuid IS NULL OR m.id > $1::uuid)
       AND ($2::timestamptz IS NULL OR m.created_at < $2::timestamptz)
     ORDER BY m.id ASC
     LIMIT $3::int`,
    [
      opts.cursorAfterMediaId,
      opts.cutoffCreatedBefore ? opts.cutoffCreatedBefore.toISOString() : null,
      opts.batchSize,
    ],
  );
  return rows;
}

async function loadHistogram(pool: Pool): Promise<{ status: string; count: string }[]> {
  const { rows } = await pool.query<{ status: string; count: string }>(
    `SELECT COALESCE(m.video_processing_status::text, '(null)') AS status, COUNT(*)::text AS count
     FROM media_files m
     WHERE m.mime_type ILIKE 'video/%'
       AND ${mediaReadableSql("m")}
     GROUP BY 1
     ORDER BY 1`,
  );
  return rows;
}

async function loadFailedReasons(pool: Pool): Promise<{ video_processing_error: string | null; count: string }[]> {
  const { rows } = await pool.query<{ video_processing_error: string | null; count: string }>(
    `SELECT m.video_processing_error, COUNT(*)::text AS count
     FROM media_files m
     WHERE m.mime_type ILIKE 'video/%'
       AND ${mediaReadableSql("m")}
       AND m.video_processing_status = 'failed'
     GROUP BY 1
     ORDER BY COUNT(*) DESC
     LIMIT 25`,
  );
  return rows;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function runVideoHlsLegacyBackfill(
  opts: VideoHlsLegacyBackfillOptions,
  deps?: {
    pool?: Pool;
    enqueue?: typeof enqueueMediaTranscodeJob;
    sleepFn?: (ms: number) => Promise<void>;
  },
): Promise<VideoHlsLegacyBackfillReport> {
  const pool = deps?.pool ?? getPool();
  const enqueue = deps?.enqueue ?? enqueueMediaTranscodeJob;
  const sleepFn = deps?.sleepFn ?? sleep;

  const report: VideoHlsLegacyBackfillReport = {
    dryRun: opts.dryRun,
    pipelineEnabled: null,
    abortedReason: null,
    batches: 0,
    candidatesScanned: 0,
    skippedOversized: 0,
    skippedPipelineOff: 0,
    enqueue: {
      queuedNew: 0,
      alreadyQueued: 0,
      alreadyReady: 0,
      notVideo: 0,
      notReadable: 0,
      noS3Key: 0,
      notFound: 0,
      errors: 0,
    },
    lastMediaId: opts.cursorAfterMediaId,
    statusHistogram: [],
    failedReasons: [],
  };

  const pipelineOn = await getConfigBool("video_hls_pipeline_enabled", false);
  report.pipelineEnabled = pipelineOn;

  if (!pipelineOn && opts.requirePipelineEnabled) {
    if (opts.dryRun) {
      report.abortedReason = null;
    } else {
      report.abortedReason = "video_hls_pipeline_enabled is false (enable in admin settings or use dry-run only)";
      report.skippedPipelineOff = 1;
      report.statusHistogram = await loadHistogram(pool);
      report.failedReasons = await loadFailedReasons(pool);
      return report;
    }
  }

  const effectiveLimit = resolveEffectiveLimit(opts.limit, opts.defaultRunCap);
  let cursor: string | null = opts.cursorAfterMediaId;
  let processed = 0;

  while (processed < effectiveLimit) {
    const take = Math.min(
      clampBackfillBatchSize(opts.batchSize),
      effectiveLimit - processed,
    );
    if (take <= 0) break;

    const batch = await fetchLegacyBackfillBatch(pool, {
      batchSize: take,
      cursorAfterMediaId: cursor,
      cutoffCreatedBefore: opts.cutoffCreatedBefore,
      includeFailed: opts.includeFailed,
    });

    if (batch.length === 0) break;
    report.batches += 1;

    for (const row of batch) {
      processed += 1;
      report.candidatesScanned += 1;

      const sz = row.size_bytes != null ? BigInt(row.size_bytes) : 0n;
      if (sz > BigInt(opts.maxSizeBytes)) {
        report.skippedOversized += 1;
        continue;
      }

      if (opts.dryRun) {
        continue;
      }

      try {
        const out = await enqueue(row.id);
        if (!out.ok) {
          if (out.error === "not_video") report.enqueue.notVideo += 1;
          else if (out.error === "not_readable") report.enqueue.notReadable += 1;
          else if (out.error === "no_s3_key") report.enqueue.noS3Key += 1;
          else if (out.error === "not_found") report.enqueue.notFound += 1;
          continue;
        }
        if (out.kind === "already_ready") report.enqueue.alreadyReady += 1;
        else if (out.alreadyQueued) report.enqueue.alreadyQueued += 1;
        else report.enqueue.queuedNew += 1;
      } catch {
        report.enqueue.errors += 1;
      }
    }

    cursor = batch[batch.length - 1]?.id ?? cursor;
    report.lastMediaId = cursor;

    if (batch.length < take) break;

    const rest = effectiveLimit - processed;
    if (rest <= 0) break;

    const sleepMs = clampBackfillSleepMs(opts.sleepMsBetweenBatches);
    if (sleepMs > 0) await sleepFn(sleepMs);
  }

  report.statusHistogram = await loadHistogram(pool);
  report.failedReasons = await loadFailedReasons(pool);
  return report;
}
