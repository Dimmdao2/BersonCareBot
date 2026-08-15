import { sql } from 'drizzle-orm';
import {
  getWebappSqlDb,
  runWebappSql,
  runWebappTransaction,
  type WebappSqlTransactionExecutor,
} from '@/infra/db/runWebappSql';

export type MediaWorkerClaim = {
  id: string;
  mediaId: string;
  organizationId: string;
  attempts: number;
};
export type MediaWorkerLoadedMedia = {
  id: string;
  mimeType: string;
  s3Key: string | null;
  hlsMasterPlaylistS3Key: string | null;
  videoProcessingStatus: string | null;
  videoDurationSeconds: number | null;
  usagePurpose: string | null;
};
type JobRef = Pick<MediaWorkerClaim, 'id' | 'mediaId'>;

function controlConflict(): never {
  throw new Error('media_worker_control_conflict');
}

export async function assertMediaWorkerControlReady(): Promise<void> {
  await Promise.all([
    runWebappSql(getWebappSqlDb(), sql`SELECT 1 FROM public.media_transcode_jobs WHERE false`),
    runWebappSql(getWebappSqlDb(), sql`SELECT 1 FROM public.media_files WHERE false`),
  ]);
}

export async function reclaimAndClaimMediaWorkerJob(params: {
  enabled: boolean;
  lockedBy: string;
  staleLockMinutes: number;
}): Promise<{ kind: 'disabled' | 'idle' } | { kind: 'claimed'; job: MediaWorkerClaim }> {
  if (!params.enabled) return { kind: 'disabled' };
  return runWebappTransaction(async (tx) => {
    await runWebappSql(tx, sql`
      UPDATE public.media_transcode_jobs
      SET status = 'pending', locked_at = NULL, locked_by = NULL, processing_started_at = NULL,
          finished_at = NULL, updated_at = now(),
          last_error = COALESCE(last_error, '') || ' [stale_lock_reclaimed]'
      WHERE status = 'processing' AND locked_at IS NOT NULL
        AND locked_at < now() - (${params.staleLockMinutes}::int * interval '1 minute')`);
    const selected = await runWebappSql<{
      id: string;
      media_id: string;
      job_organization_id: string | null;
      media_organization_id: string | null;
    }>(tx, sql`
      SELECT j.id, j.media_id, j.organization_id AS job_organization_id, mf.organization_id AS media_organization_id
      FROM public.media_transcode_jobs j LEFT JOIN public.media_files mf ON mf.id = j.media_id
      WHERE j.status = 'pending' AND (j.next_attempt_at IS NULL OR j.next_attempt_at <= now())
      ORDER BY j.created_at ASC FOR UPDATE OF j SKIP LOCKED LIMIT 1`);
    const row = selected.rows[0];
    if (!row) return { kind: 'idle' } as const;
    if (
      !row.job_organization_id?.trim() ||
      !row.media_organization_id?.trim() ||
      row.job_organization_id !== row.media_organization_id
    ) {
      await runWebappSql(tx, sql`
        UPDATE public.media_transcode_jobs SET status = 'failed', attempts = attempts + 1, locked_at = now(),
          locked_by = ${params.lockedBy}, last_error = 'organization_invariant_violation', next_attempt_at = NULL,
          processing_started_at = NULL, finished_at = now(), updated_at = now()
        WHERE id = ${row.id}::uuid AND status = 'pending'`);
      return { kind: 'idle' } as const;
    }
    const claimed = await runWebappSql<{
      id: string;
      media_id: string;
      organization_id: string;
      attempts: number;
    }>(tx, sql`
      UPDATE public.media_transcode_jobs SET status = 'processing', locked_at = now(), locked_by = ${params.lockedBy},
        attempts = attempts + 1, processing_started_at = now(), finished_at = NULL, updated_at = now()
      WHERE id = ${row.id}::uuid AND status = 'pending'
      RETURNING id, media_id, organization_id, attempts`);
    const job = claimed.rows[0];
    if (!job) return { kind: 'idle' } as const;
    return {
      kind: 'claimed' as const,
      job: {
        id: job.id,
        mediaId: job.media_id,
        organizationId: job.organization_id,
        attempts: job.attempts,
      },
    };
  });
}

export async function loadMediaWorkerControlMedia(
  job: JobRef,
  lockedBy: string,
): Promise<MediaWorkerLoadedMedia | null> {
  const result = await runWebappSql<{
    id: string;
    mime_type: string;
    s3_key: string | null;
    hls_master_playlist_s3_key: string | null;
    video_processing_status: string | null;
    video_duration_seconds: number | null;
    usage_purpose: string | null;
  }>(getWebappSqlDb(), sql`
    SELECT mf.id, mf.mime_type, mf.s3_key, mf.hls_master_playlist_s3_key, mf.video_processing_status,
      mf.video_duration_seconds, mf.usage_purpose
    FROM public.media_transcode_jobs j JOIN public.media_files mf ON mf.id = j.media_id
    WHERE j.id = ${job.id}::uuid AND j.media_id = ${job.mediaId}::uuid AND j.status = 'processing'
      AND j.locked_by = ${lockedBy} AND j.organization_id = mf.organization_id`);
  const row = result.rows[0];
  return row
    ? {
        id: row.id,
        mimeType: row.mime_type,
        s3Key: row.s3_key,
        hlsMasterPlaylistS3Key: row.hls_master_playlist_s3_key,
        videoProcessingStatus: row.video_processing_status,
        videoDurationSeconds: row.video_duration_seconds,
        usagePurpose: row.usage_purpose,
      }
    : null;
}

async function withOwnedProcessingJob<T>(
  job: JobRef,
  lockedBy: string,
  work: (tx: WebappSqlTransactionExecutor) => Promise<T>,
): Promise<T> {
  return runWebappTransaction(async (tx) => {
    const locked = await runWebappSql<{ media_id: string }>(tx, sql`
      SELECT j.media_id FROM public.media_transcode_jobs j JOIN public.media_files mf ON mf.id = j.media_id
      WHERE j.id = ${job.id}::uuid AND j.media_id = ${job.mediaId}::uuid AND j.status = 'processing'
        AND j.locked_by = ${lockedBy} AND j.organization_id = mf.organization_id FOR UPDATE OF j`);
    if (!locked.rows[0]) controlConflict();
    return work(tx);
  });
}

export async function markMediaWorkerProcessing(job: JobRef, lockedBy: string): Promise<void> {
  await withOwnedProcessingJob(job, lockedBy, async (tx) => {
    await runWebappSql(tx, sql`
      UPDATE public.media_files SET video_processing_status = 'processing', video_processing_error = NULL
      WHERE id = ${job.mediaId}::uuid`);
  });
}

export async function retryMediaWorkerJob(
  job: JobRef,
  lockedBy: string,
  nextAttemptAt: string,
  error: string,
): Promise<void> {
  await withOwnedProcessingJob(job, lockedBy, async (tx) => {
    await runWebappSql(tx, sql`
      UPDATE public.media_transcode_jobs SET status = 'pending', last_error = ${error},
        next_attempt_at = ${nextAttemptAt}::timestamptz, locked_at = NULL, locked_by = NULL,
        processing_started_at = NULL, finished_at = NULL, updated_at = now()
      WHERE id = ${job.id}::uuid`);
    await runWebappSql(tx, sql`
      UPDATE public.media_files SET video_processing_status = 'pending', video_processing_error = ${error}
      WHERE id = ${job.mediaId}::uuid`);
  });
}

export async function failMediaWorkerJob(
  job: JobRef,
  lockedBy: string,
  error: string,
): Promise<void> {
  await withOwnedProcessingJob(job, lockedBy, async (tx) => {
    await runWebappSql(tx, sql`
      UPDATE public.media_transcode_jobs SET status = 'failed', last_error = ${error}, locked_at = NULL,
        locked_by = NULL, next_attempt_at = NULL, finished_at = now(), updated_at = now()
      WHERE id = ${job.id}::uuid`);
    await runWebappSql(tx, sql`
      UPDATE public.media_files SET video_processing_status = 'failed', video_processing_error = ${error}
      WHERE id = ${job.mediaId}::uuid`);
  });
}

export async function completeMediaWorkerHlsJob(
  job: JobRef,
  lockedBy: string,
  values: {
    masterKey?: string;
    artifactPrefix?: string;
    posterKey?: string;
    qualitiesJson?: string;
    durationSeconds?: number | null;
  },
): Promise<void> {
  await withOwnedProcessingJob(job, lockedBy, async (tx) => {
    await runWebappSql(tx, sql`
      UPDATE public.media_files SET video_processing_status = 'ready', video_processing_error = NULL,
        hls_master_playlist_s3_key = COALESCE(${values.masterKey ?? null}, hls_master_playlist_s3_key),
        hls_artifact_prefix = COALESCE(${values.artifactPrefix ?? null}, hls_artifact_prefix),
        poster_s3_key = COALESCE(${values.posterKey ?? null}, poster_s3_key),
        available_qualities_json = COALESCE(${values.qualitiesJson ?? null}::jsonb, available_qualities_json),
        video_duration_seconds = COALESCE(${values.durationSeconds ?? null}, video_duration_seconds)
      WHERE id = ${job.mediaId}::uuid`);
    await runWebappSql(tx, sql`UPDATE public.media_transcode_jobs SET status = 'done', locked_at = NULL, locked_by = NULL, last_error = NULL, finished_at = now(), updated_at = now() WHERE id = ${job.id}::uuid`);
  });
}

export async function completeMediaWorkerProgramJob(
  job: JobRef,
  lockedBy: string,
  values: {
    outputKey: string;
    posterKey: string;
    qualitiesJson: string;
    durationSeconds: number | null;
  },
): Promise<void> {
  await withOwnedProcessingJob(job, lockedBy, async (tx) => {
    await runWebappSql(tx, sql`
      UPDATE public.media_files SET s3_key = ${values.outputKey}, mime_type = 'video/mp4',
        video_processing_status = 'ready', video_processing_error = NULL,
        video_delivery_override = 'mp4', available_qualities_json = ${values.qualitiesJson}::jsonb,
        hls_master_playlist_s3_key = NULL, hls_artifact_prefix = NULL,
        poster_s3_key = ${values.posterKey},
        video_duration_seconds = COALESCE(${values.durationSeconds}, video_duration_seconds)
      WHERE id = ${job.mediaId}::uuid`);
    await runWebappSql(tx, sql`UPDATE public.media_transcode_jobs SET status = 'done', locked_at = NULL, locked_by = NULL, last_error = NULL, finished_at = now(), updated_at = now() WHERE id = ${job.id}::uuid`);
  });
}
