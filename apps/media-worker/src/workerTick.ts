import { runWithObservabilityContext } from './observability.js';
import type { MediaWorkerControlPort } from './control.js';
import { processTranscodeJob, type TranscodeContext } from './processTranscodeJob.js';
import { processPreviewOrder, type PreviewContext } from './processPreviewJob.js';

export type MediaWorkerTickContext = TranscodeContext &
  PreviewContext & {
    control: MediaWorkerControlPort;
    lockId: string;
    staleLockMinutes: number;
    /** Срок аренды строки превью: не уложился воркер — строка вернётся в оборот сама. */
    previewLeaseMinutes: number;
  };
export type MediaWorkerTickResult =
  | 'disabled'
  | 'idle'
  | 'processed'
  | 'preview_processed'
  | 'preview_error';

/**
 * Один оборот воркера: сначала пересборка видео, затем превью.
 *
 * Очередь превью НЕ подчиняется флагу `video_hls_pipeline_enabled`. Он выключает конвейер HLS —
 * а превью нужны всегда: без них у врача в библиотеке пустые плитки, и раньше их считал host-cron,
 * который об этом флаге не знал вовсе. Поэтому «disabled» у пересборки не мешает взять превью.
 */
export async function runMediaWorkerTick(ctx: MediaWorkerTickContext): Promise<MediaWorkerTickResult> {
  const claimed = await ctx.control.claim(ctx.lockId, ctx.staleLockMinutes);
  if (claimed.kind === 'claimed') {
    const { job } = claimed;
    return runWithObservabilityContext({ correlationId: job.id, organizationId: job.organizationId }, async () => {
      ctx.log.info({ jobId: job.id, mediaId: job.mediaId, attempt: job.attempts }, 'processing transcode job');
      await processTranscodeJob(ctx, job);
      return 'processed' as const;
    });
  }
  if (claimed.kind === 'disabled') {
    ctx.log.debug('video_hls_pipeline_enabled is false; transcode queue idle');
  }

  const preview = await ctx.control.previewClaim(ctx.previewLeaseMinutes);
  if (preview.kind === 'claimed') {
    const { order } = preview;
    return runWithObservabilityContext({ correlationId: order.mediaId }, async () => {
      ctx.log.info(
        { mediaId: order.mediaId, plan: order.plan.kind, attempts: order.attempts },
        'processing preview order',
      );
      const outcome = await processPreviewOrder(ctx, order);
      return outcome === 'processed' ? ('preview_processed' as const) : ('preview_error' as const);
    });
  }

  return claimed.kind === 'disabled' ? 'disabled' : 'idle';
}
