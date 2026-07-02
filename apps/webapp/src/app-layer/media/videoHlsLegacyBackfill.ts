/**
 * VIDEO_HLS_DELIVERY phase-07: batch enqueue transcode jobs for legacy library videos
 * (readable rows without HLS yet). Used by scripts/video-hls-backfill-legacy.ts.
 *
 * Dry-run: never calls enqueue — no writes to jobs/media via enqueue path. Final report uses
 * read-only repo methods (`loadHistogram`, `loadFailedReasons`).
 */

import { enqueueMediaTranscodeJob } from "@/app-layer/media/mediaTranscodeJobs";
import { getConfigBool } from "@/modules/system-settings/configAdapter";
import {
  createPgVideoHlsLegacyBackfillReadRepo,
  type VideoHlsLegacyBackfillCandidateRow,
  type VideoHlsLegacyBackfillReadRepo,
} from "@/infra/repos/pgVideoHlsLegacyBackfill";
import {
  legacyHlsBackfillCandidateWhereClause,
  VIDEO_HLS_LEGACY_MAX_OBJECT_BYTES,
} from "@/infra/repos/mediaHlsLegacySqlFilters";
export {
  legacyHlsBackfillCandidateWhereClause,
  legacyHlsReconcileEligibleForEnqueueSqlFilter,
  MEDIA_READABLE_SQL_M,
  mediaReadableSql,
  VIDEO_HLS_LEGACY_MAX_OBJECT_BYTES,
} from "@/infra/repos/mediaHlsLegacySqlFilters";

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
  readRepo: VideoHlsLegacyBackfillReadRepo,
  opts: {
    batchSize: number;
    cursorAfterMediaId: string | null;
    cutoffCreatedBefore: Date | null;
    includeFailed: boolean;
  },
): Promise<VideoHlsLegacyBackfillCandidateRow[]> {
  return readRepo.fetchBatch(opts);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function runVideoHlsLegacyBackfill(
  opts: VideoHlsLegacyBackfillOptions,
  deps?: {
    readRepo?: VideoHlsLegacyBackfillReadRepo;
    enqueue?: typeof enqueueMediaTranscodeJob;
    sleepFn?: (ms: number) => Promise<void>;
  },
): Promise<VideoHlsLegacyBackfillReport> {
  const readRepo = deps?.readRepo ?? createPgVideoHlsLegacyBackfillReadRepo();
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
      report.statusHistogram = await readRepo.loadHistogram();
      report.failedReasons = await readRepo.loadFailedReasons();
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

    const batch = await fetchLegacyBackfillBatch(readRepo, {
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

  report.statusHistogram = await readRepo.loadHistogram();
  report.failedReasons = await readRepo.loadFailedReasons();
  return report;
}
