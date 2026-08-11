import { runWithObservabilityContext } from './observability.js';
import type { MediaWorkerControlPort } from './control.js';
import { processTranscodeJob, type TranscodeContext } from './processTranscodeJob.js';

export type MediaWorkerTickContext = TranscodeContext & {
  control: MediaWorkerControlPort;
  lockId: string;
  staleLockMinutes: number;
};
export type MediaWorkerTickResult = 'disabled' | 'idle' | 'processed';

export async function runMediaWorkerTick(ctx: MediaWorkerTickContext): Promise<MediaWorkerTickResult> {
  const claimed = await ctx.control.claim(ctx.lockId, ctx.staleLockMinutes);
  if (claimed.kind === 'disabled') {
    ctx.log.debug('video_hls_pipeline_enabled is false; idle');
    return 'disabled';
  }
  if (claimed.kind !== 'claimed') return 'idle';
  const { job } = claimed;
  return runWithObservabilityContext({ correlationId: job.id, organizationId: job.organizationId }, async () => {
    ctx.log.info({ jobId: job.id, mediaId: job.mediaId, attempt: job.attempts }, 'processing transcode job');
    await processTranscodeJob(ctx, job);
    return 'processed' as const;
  });
}
