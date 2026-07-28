import type { Pool } from 'pg';
import { runWithObservabilityContext } from '@bersoncare/db-principal';
import type { ClaimedJob } from './jobs/claim.js';
import { claimNextJob, reclaimStaleProcessing } from './jobs/claim.js';
import type { Logger } from './logger.js';
import { processTranscodeJob, type TranscodeContext } from './processTranscodeJob.js';
import { readPipelineEnabled } from './pipelineEnabled.js';
import { runWithMediaWorkerInfraPrincipal } from './runMediaWorkerSql.js';

export type MediaWorkerTickContext = TranscodeContext & {
  lockId: string;
  staleLockMinutes: number;
};

export type MediaWorkerTickResult = 'disabled' | 'idle' | 'processed';

export type MediaWorkerTickDeps = {
  readPipelineEnabled?: (pool: Pool) => Promise<boolean>;
  reclaimStaleProcessing?: (pool: Pool, staleLockMinutes: number, log: Logger) => Promise<number>;
  claimNextJob?: (pool: Pool, lockedBy: string) => Promise<ClaimedJob | null>;
  processTranscodeJob?: (ctx: TranscodeContext, job: ClaimedJob) => Promise<void>;
};

export async function runMediaWorkerTick(
  ctx: MediaWorkerTickContext,
  deps: MediaWorkerTickDeps = {},
): Promise<MediaWorkerTickResult> {
  return runWithMediaWorkerInfraPrincipal('media-worker:tick', async () => {
    const readEnabled = deps.readPipelineEnabled ?? readPipelineEnabled;
    const reclaimStale = deps.reclaimStaleProcessing ?? reclaimStaleProcessing;
    const claimJob = deps.claimNextJob ?? claimNextJob;
    const processJob = deps.processTranscodeJob ?? processTranscodeJob;

    const enabled = await readEnabled(ctx.pool);
    if (!enabled) {
      ctx.log.debug('video_hls_pipeline_enabled is false; idle');
      return 'disabled';
    }

    await reclaimStale(ctx.pool, ctx.staleLockMinutes, ctx.log);
    const job = await claimJob(ctx.pool, ctx.lockId);
    if (!job) {
      return 'idle';
    }

    return runWithObservabilityContext(
      { correlationId: job.id, organizationId: job.organizationId },
      async () => {
        ctx.log.info(
          { jobId: job.id, mediaId: job.mediaId, attempt: job.attempts },
          'processing transcode job',
        );
        await processJob(ctx, job);
        return 'processed' as const;
      },
    );
  });
}
