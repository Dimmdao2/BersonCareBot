/**
 * Media-worker control acceptance on the repository's private PostgreSQL 16 harness.
 *
 * Named failures: duplicate claim, future/orphan/cross-org claim, stale/wrong lock mutation,
 * replayed terminal mutation, and partial media/job completion after the second UPDATE fails.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { getPool } from '@/infra/db/client';
import {
  completeMediaWorkerHlsJob,
  completeMediaWorkerProgramJob,
  failMediaWorkerJob,
  loadMediaWorkerControlMedia,
  markMediaWorkerProcessing,
  reclaimAndClaimMediaWorkerJob,
  retryMediaWorkerJob,
} from './pgMediaWorkerControl';

type JobState = {
  status: string;
  attempts: number;
  locked_by: string | null;
  locked_at_is_null: boolean;
  next_attempt_at: string | null;
  processing_started_at_is_null: boolean;
  finished_at_is_null: boolean;
  last_error: string | null;
};

type MediaState = {
  video_processing_status: string | null;
  video_processing_error: string | null;
  s3_key: string | null;
  mime_type: string;
  hls_master_playlist_s3_key: string | null;
  hls_artifact_prefix: string | null;
  poster_s3_key: string | null;
  available_qualities_json: unknown;
  video_duration_seconds: number | null;
  video_delivery_override: string | null;
};

describe('pgMediaWorkerControl', () => {
  const fixturePool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
  const mediaIds = new Set<string>();
  const jobIds = new Set<string>();
  const organizationIds = new Set<string>();

  async function query<T extends pg.QueryResultRow>(text: string, values: readonly unknown[] = []): Promise<T[]> {
    return (await fixturePool.query<T>(text, [...values])).rows;
  }

  async function ensureOrganization(id: string): Promise<void> {
    if (organizationIds.has(id)) return;
    organizationIds.add(id);
    await query(
      `INSERT INTO public.be_organizations (id, title)
       VALUES ($1::uuid, $2) ON CONFLICT (id) DO NOTHING`,
      [id, `Media control fixture ${id}`],
    );
  }

  async function insertMedia(input: {
    id?: string;
    organizationId?: string | null;
    mimeType?: string;
    processingStatus?: string | null;
    processingError?: string | null;
    s3Key?: string | null;
  } = {}): Promise<string> {
    const id = input.id ?? randomUUID();
    const organizationId = input.organizationId === undefined ? randomUUID() : input.organizationId;
    if (organizationId !== null) await ensureOrganization(organizationId);
    mediaIds.add(id);
    await query(
      `INSERT INTO public.media_files (
         id, owner_kind, organization_id, original_name, stored_path, mime_type, size_bytes,
         s3_key, video_processing_status, video_processing_error
       ) VALUES (
         $1::uuid, CASE WHEN $2::uuid IS NULL THEN 'platform' ELSE 'organization' END, $2::uuid,
         $3, $4, $5, 1024, $6, $7, $8
       )`,
      [
        id,
        organizationId,
        `fixture-${id}.mp4`,
        `/fixture/${id}.mp4`,
        input.mimeType ?? 'video/mp4',
        input.s3Key === undefined ? `media/${id}/file/source.mp4` : input.s3Key,
        input.processingStatus === undefined ? 'pending' : input.processingStatus,
        input.processingError ?? null,
      ],
    );
    return id;
  }

  async function insertJob(input: {
    id?: string;
    mediaId: string;
    organizationId: string | null;
    status?: 'pending' | 'processing' | 'done' | 'failed';
    attempts?: number;
    lockedBy?: string | null;
    lockedAt?: string | null;
    nextAttemptAt?: string | null;
    createdAt?: string;
  }): Promise<string> {
    const id = input.id ?? randomUUID();
    if (input.organizationId !== null) await ensureOrganization(input.organizationId);
    jobIds.add(id);
    await query(
      `INSERT INTO public.media_transcode_jobs (
         id, media_id, organization_id, status, attempts, locked_by, locked_at,
         next_attempt_at, processing_started_at, created_at, updated_at
       ) VALUES (
         $1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7::timestamptz,
         $8::timestamptz,
         CASE WHEN $4 = 'processing' THEN COALESCE($7::timestamptz, now()) ELSE NULL END,
         COALESCE($9::timestamptz, now()), now()
       )`,
      [
        id,
        input.mediaId,
        input.organizationId,
        input.status ?? 'pending',
        input.attempts ?? 0,
        input.lockedBy ?? null,
        input.lockedAt ?? null,
        input.nextAttemptAt ?? null,
        input.createdAt ?? null,
      ],
    );
    return id;
  }

  async function readJob(id: string): Promise<JobState> {
    const rows = await query<JobState>(
      `SELECT status, attempts, locked_by, locked_at IS NULL AS locked_at_is_null,
              next_attempt_at::text, processing_started_at IS NULL AS processing_started_at_is_null,
              finished_at IS NULL AS finished_at_is_null, last_error
       FROM public.media_transcode_jobs WHERE id = $1::uuid`,
      [id],
    );
    return rows[0]!;
  }

  async function readMedia(id: string): Promise<MediaState> {
    const rows = await query<MediaState>(
      `SELECT video_processing_status, video_processing_error, s3_key, mime_type,
              hls_master_playlist_s3_key, hls_artifact_prefix, poster_s3_key,
              available_qualities_json, video_duration_seconds, video_delivery_override
       FROM public.media_files WHERE id = $1::uuid`,
      [id],
    );
    return rows[0]!;
  }

  beforeAll(async () => {
    const database = await query<{ name: string }>('SELECT current_database() AS name');
    expect(database[0]?.name).toMatch(/^pbt_/);
    await query('ALTER TABLE public.be_organizations DISABLE ROW LEVEL SECURITY');
    await query('ALTER TABLE public.be_organizations DISABLE TRIGGER USER');
    await query('ALTER TABLE public.media_transcode_jobs DISABLE ROW LEVEL SECURITY');
    await query('ALTER TABLE public.media_files DISABLE ROW LEVEL SECURITY');
  });

  afterEach(async () => {
    await query('DROP TRIGGER IF EXISTS pbt_reject_media_job_done ON public.media_transcode_jobs');
    await query('DROP FUNCTION IF EXISTS public.pbt_reject_media_job_done()');
    if (jobIds.size > 0) {
      await query('DELETE FROM public.media_transcode_jobs WHERE id = ANY($1::uuid[])', [[...jobIds]]);
      jobIds.clear();
    }
    if (mediaIds.size > 0) {
      await query('DELETE FROM public.media_files WHERE id = ANY($1::uuid[])', [[...mediaIds]]);
      mediaIds.clear();
    }
    if (organizationIds.size > 0) {
      await query('DELETE FROM public.be_organizations WHERE id = ANY($1::uuid[])', [[...organizationIds]]);
      organizationIds.clear();
    }
  });

  afterAll(async () => {
    await query('ALTER TABLE public.media_transcode_jobs ENABLE ROW LEVEL SECURITY');
    await query('ALTER TABLE public.media_files ENABLE ROW LEVEL SECURITY');
    await query('ALTER TABLE public.be_organizations ENABLE TRIGGER USER');
    await query('ALTER TABLE public.be_organizations ENABLE ROW LEVEL SECURITY');
    await fixturePool.end();
    await getPool().end();
  });

  it('atomically gives one pending job to one of two concurrent claimers', async () => {
    const organizationId = randomUUID();
    const mediaId = await insertMedia({ organizationId });
    const jobId = await insertJob({ mediaId, organizationId });

    const results = await Promise.all([
      reclaimAndClaimMediaWorkerJob({ enabled: true, lockedBy: 'worker-a', staleLockMinutes: 30 }),
      reclaimAndClaimMediaWorkerJob({ enabled: true, lockedBy: 'worker-b', staleLockMinutes: 30 }),
    ]);

    const claimed = results.filter((result) => result.kind === 'claimed');
    expect(claimed).toHaveLength(1);
    expect(claimed[0]).toMatchObject({
      kind: 'claimed',
      job: { id: jobId, mediaId, organizationId, attempts: 1 },
    });
    expect(results.filter((result) => result.kind === 'idle')).toHaveLength(1);
    expect(await readJob(jobId)).toMatchObject({
      status: 'processing', attempts: 1, locked_at_is_null: false,
    });
  });

  it('reclaims a stale processing job but leaves a future pending job unclaimed', async () => {
    const organizationId = randomUUID();
    const futureMediaId = await insertMedia({ organizationId });
    const futureJobId = await insertJob({
      mediaId: futureMediaId,
      organizationId,
      nextAttemptAt: '2999-01-01T00:00:00.000Z',
      createdAt: '2000-01-01T00:00:00.000Z',
    });
    const staleMediaId = await insertMedia({ organizationId });
    const staleJobId = await insertJob({
      mediaId: staleMediaId,
      organizationId,
      status: 'processing',
      attempts: 1,
      lockedBy: 'dead-worker',
      lockedAt: '2000-01-01T00:00:00.000Z',
    });

    const result = await reclaimAndClaimMediaWorkerJob({
      enabled: true,
      lockedBy: 'replacement-worker',
      staleLockMinutes: 30,
    });

    expect(result).toMatchObject({
      kind: 'claimed',
      job: { id: staleJobId, mediaId: staleMediaId, organizationId, attempts: 2 },
    });
    expect(await readJob(staleJobId)).toMatchObject({
      status: 'processing', attempts: 2, locked_by: 'replacement-worker',
    });
    expect(await readJob(futureJobId)).toMatchObject({ status: 'pending', attempts: 0 });
  });

  it('quarantines missing and mismatched media ownership and never returns either row', async () => {
    const orphanMediaId = randomUUID();
    const orphanJobId = randomUUID();
    const orphanOrganizationId = randomUUID();
    await ensureOrganization(orphanOrganizationId);
    jobIds.add(orphanJobId);
    await query('ALTER TABLE public.media_transcode_jobs DROP CONSTRAINT media_transcode_jobs_media_id_fkey');
    try {
      await query(
        `INSERT INTO public.media_transcode_jobs (id, media_id, organization_id, status, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, $3::uuid, 'pending', '1999-01-01T00:00:00Z', now())`,
        [orphanJobId, orphanMediaId, orphanOrganizationId],
      );
      await expect(reclaimAndClaimMediaWorkerJob({
        enabled: true, lockedBy: 'worker-a', staleLockMinutes: 30,
      })).resolves.toEqual({ kind: 'idle' });
      expect(await readJob(orphanJobId)).toMatchObject({
        status: 'failed', attempts: 1, last_error: 'organization_invariant_violation',
      });
    } finally {
      await query('DELETE FROM public.media_transcode_jobs WHERE id = $1::uuid', [orphanJobId]);
      jobIds.delete(orphanJobId);
      await query(
        `ALTER TABLE public.media_transcode_jobs
         ADD CONSTRAINT media_transcode_jobs_media_id_fkey FOREIGN KEY (media_id)
         REFERENCES public.media_files(id) ON DELETE CASCADE`,
      );
    }

    const mediaOrganizationId = randomUUID();
    const mediaId = await insertMedia({ organizationId: mediaOrganizationId });
    const mismatchedJobId = await insertJob({
      mediaId,
      organizationId: randomUUID(),
      createdAt: '2000-01-01T00:00:00.000Z',
    });
    await expect(reclaimAndClaimMediaWorkerJob({
      enabled: true, lockedBy: 'worker-a', staleLockMinutes: 30,
    })).resolves.toEqual({ kind: 'idle' });
    expect(await readJob(mismatchedJobId)).toMatchObject({
      status: 'failed', attempts: 1, last_error: 'organization_invariant_violation',
    });
  });

  it('rejects wrong owner, stale state, spoofed media, and cross-org mutations without changing rows', async () => {
    const organizationId = randomUUID();
    const mediaId = await insertMedia({ organizationId, processingStatus: 'pending' });
    const otherMediaId = await insertMedia({ organizationId: randomUUID(), processingStatus: 'pending' });
    const jobId = await insertJob({
      mediaId,
      organizationId,
      status: 'processing',
      attempts: 2,
      lockedBy: 'worker-a',
      lockedAt: new Date().toISOString(),
    });
    const originalJob = await readJob(jobId);
    const originalMedia = await readMedia(mediaId);

    await expect(retryMediaWorkerJob(
      { id: jobId, mediaId },
      'worker-b',
      '2026-08-11T20:00:00.000Z',
      'wrong owner',
    )).rejects.toThrow('media_worker_control_conflict');
    await expect(markMediaWorkerProcessing({ id: jobId, mediaId: otherMediaId }, 'worker-a'))
      .rejects.toThrow('media_worker_control_conflict');
    await expect(loadMediaWorkerControlMedia({ id: jobId, mediaId }, 'worker-b')).resolves.toBeNull();
    expect(await readJob(jobId)).toEqual(originalJob);
    expect(await readMedia(mediaId)).toEqual(originalMedia);

    const mismatchedOrganizationId = randomUUID();
    await ensureOrganization(mismatchedOrganizationId);
    await query(
      `UPDATE public.media_transcode_jobs SET organization_id = $2::uuid WHERE id = $1::uuid`,
      [jobId, mismatchedOrganizationId],
    );
    const crossOrgJob = await readJob(jobId);
    await expect(failMediaWorkerJob({ id: jobId, mediaId }, 'worker-a', 'cross org'))
      .rejects.toThrow('media_worker_control_conflict');
    expect(await readJob(jobId)).toEqual(crossOrgJob);
    expect(await readMedia(mediaId)).toEqual(originalMedia);

    await query(
      `UPDATE public.media_transcode_jobs SET organization_id = $2::uuid, status = 'pending'
       WHERE id = $1::uuid`,
      [jobId, organizationId],
    );
    const staleJob = await readJob(jobId);
    await expect(markMediaWorkerProcessing({ id: jobId, mediaId }, 'worker-a'))
      .rejects.toThrow('media_worker_control_conflict');
    expect(await readJob(jobId)).toEqual(staleJob);
    expect(await readMedia(mediaId)).toEqual(originalMedia);
  });

  it('preserves retry and permanent-failure queue/media state semantics', async () => {
    const organizationId = randomUUID();
    const retryMediaId = await insertMedia({ organizationId, processingStatus: 'processing' });
    const retryJobId = await insertJob({
      mediaId: retryMediaId,
      organizationId,
      status: 'processing',
      attempts: 2,
      lockedBy: 'worker-a',
      lockedAt: new Date().toISOString(),
    });
    const spoofedClaim = {
      id: retryJobId,
      mediaId: retryMediaId,
      organizationId: randomUUID(),
      attempts: 999,
    };
    await retryMediaWorkerJob(
      spoofedClaim,
      'worker-a',
      '2026-08-11T20:00:00.000Z',
      'retry error',
    );
    expect(await readJob(retryJobId)).toMatchObject({
      status: 'pending', attempts: 2, locked_by: null, locked_at_is_null: true,
      processing_started_at_is_null: true, finished_at_is_null: true, last_error: 'retry error',
    });
    expect(new Date((await readJob(retryJobId)).next_attempt_at!).toISOString())
      .toBe('2026-08-11T20:00:00.000Z');
    expect(await readMedia(retryMediaId)).toMatchObject({
      video_processing_status: 'pending', video_processing_error: 'retry error',
    });

    const failedMediaId = await insertMedia({ organizationId, processingStatus: 'processing' });
    const failedJobId = await insertJob({
      mediaId: failedMediaId,
      organizationId,
      status: 'processing',
      attempts: 5,
      lockedBy: 'worker-a',
      lockedAt: new Date().toISOString(),
    });
    await failMediaWorkerJob({ id: failedJobId, mediaId: failedMediaId }, 'worker-a', 'terminal error');
    expect(await readJob(failedJobId)).toMatchObject({
      status: 'failed', attempts: 5, locked_by: null, locked_at_is_null: true,
      next_attempt_at: null, finished_at_is_null: false, last_error: 'terminal error',
    });
    expect(await readMedia(failedMediaId)).toMatchObject({
      video_processing_status: 'failed', video_processing_error: 'terminal error',
    });
  });

  it('commits complete HLS and program outcomes and rejects a terminal replay', async () => {
    const organizationId = randomUUID();
    const hlsMediaId = await insertMedia({ organizationId, processingStatus: 'processing' });
    const hlsJobId = await insertJob({
      mediaId: hlsMediaId,
      organizationId,
      status: 'processing',
      attempts: 1,
      lockedBy: 'worker-a',
      lockedAt: new Date().toISOString(),
    });
    const hlsQualities = JSON.stringify([{ label: '720p', path: '720p/index.m3u8' }]);
    await completeMediaWorkerHlsJob({ id: hlsJobId, mediaId: hlsMediaId }, 'worker-a', {
      masterKey: `media/${hlsMediaId}/hls/master.m3u8`,
      artifactPrefix: `media/${hlsMediaId}/hls`,
      posterKey: `media/${hlsMediaId}/poster.jpg`,
      qualitiesJson: hlsQualities,
      durationSeconds: 81,
    });
    expect(await readJob(hlsJobId)).toMatchObject({
      status: 'done', attempts: 1, locked_by: null, locked_at_is_null: true,
      finished_at_is_null: false, last_error: null,
    });
    expect(await readMedia(hlsMediaId)).toMatchObject({
      video_processing_status: 'ready', video_processing_error: null,
      hls_master_playlist_s3_key: `media/${hlsMediaId}/hls/master.m3u8`,
      hls_artifact_prefix: `media/${hlsMediaId}/hls`,
      poster_s3_key: `media/${hlsMediaId}/poster.jpg`,
      video_duration_seconds: 81,
    });
    expect((await readMedia(hlsMediaId)).available_qualities_json).toEqual(JSON.parse(hlsQualities));
    const completedJob = await readJob(hlsJobId);
    const completedMedia = await readMedia(hlsMediaId);
    await expect(completeMediaWorkerHlsJob(
      { id: hlsJobId, mediaId: hlsMediaId },
      'worker-a',
      { durationSeconds: 99 },
    )).rejects.toThrow('media_worker_control_conflict');
    expect(await readJob(hlsJobId)).toEqual(completedJob);
    expect(await readMedia(hlsMediaId)).toEqual(completedMedia);

    const programMediaId = await insertMedia({ organizationId, processingStatus: 'processing' });
    const programJobId = await insertJob({
      mediaId: programMediaId,
      organizationId,
      status: 'processing',
      attempts: 1,
      lockedBy: 'worker-a',
      lockedAt: new Date().toISOString(),
    });
    const programQualities = JSON.stringify([{ label: '480p', path: '480p.mp4' }]);
    await completeMediaWorkerProgramJob(
      { id: programJobId, mediaId: programMediaId },
      'worker-a',
      {
        outputKey: `media/${programMediaId}/480p.mp4`,
        posterKey: `media/${programMediaId}/poster.jpg`,
        qualitiesJson: programQualities,
        durationSeconds: 42,
      },
    );
    expect(await readJob(programJobId)).toMatchObject({ status: 'done', finished_at_is_null: false });
    expect(await readMedia(programMediaId)).toMatchObject({
      s3_key: `media/${programMediaId}/480p.mp4`, mime_type: 'video/mp4',
      video_processing_status: 'ready', video_delivery_override: 'mp4',
      hls_master_playlist_s3_key: null, hls_artifact_prefix: null,
      poster_s3_key: `media/${programMediaId}/poster.jpg`, video_duration_seconds: 42,
    });
    expect((await readMedia(programMediaId)).available_qualities_json)
      .toEqual(JSON.parse(programQualities));
  });

  it('rolls back the media update when the second completion update fails', async () => {
    const organizationId = randomUUID();
    const mediaId = await insertMedia({
      organizationId,
      processingStatus: 'processing',
      processingError: 'before',
    });
    const jobId = await insertJob({
      mediaId,
      organizationId,
      status: 'processing',
      attempts: 1,
      lockedBy: 'worker-a',
      lockedAt: new Date().toISOString(),
    });
    const originalJob = await readJob(jobId);
    const originalMedia = await readMedia(mediaId);
    await query(`
      CREATE FUNCTION public.pbt_reject_media_job_done() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.status = 'done' THEN RAISE EXCEPTION 'pbt injected second update failure'; END IF;
        RETURN NEW;
      END $$`);
    await query(`
      CREATE TRIGGER pbt_reject_media_job_done
      BEFORE UPDATE ON public.media_transcode_jobs
      FOR EACH ROW EXECUTE FUNCTION public.pbt_reject_media_job_done()`);

    await expect(completeMediaWorkerHlsJob(
      { id: jobId, mediaId },
      'worker-a',
      { masterKey: 'must-not-commit/master.m3u8', durationSeconds: 99 },
    )).rejects.toThrow('Failed query: UPDATE media_transcode_jobs');
    expect(await readJob(jobId)).toEqual(originalJob);
    expect(await readMedia(mediaId)).toEqual(originalMedia);
  });
});
