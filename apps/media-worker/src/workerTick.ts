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
export type MediaWorkerTranscodeTickResult = 'disabled' | 'idle' | 'processed';
export type MediaWorkerPreviewTickResult = 'idle' | 'preview_processed' | 'preview_error';

/**
 * Две очереди воркера разведены на два независимых оборота, и цикл у каждой свой (`main.ts`).
 *
 * Раньше это был ОДИН оборот: сначала пересборка видео, превью — только если её очередь пуста.
 * Независимый аудит 13.09 показал цену такой очерёдности: потолок одной пересборки —
 * `FFMPEG_TIMEOUT_MS`, два часа, и всё это время ни одно превью не бралось вовсе. До переезда с
 * host-cron превью считала отдельная дверь вебаппа, которой чужая пересборка не мешала, — то есть
 * очерёдность была не сохранением поведения, а его ухудшением. Врач в библиотеке видел пустые
 * плитки ровно столько, сколько шла чужая перекодировка видео.
 *
 * Очередь превью НЕ подчиняется флагу `video_hls_pipeline_enabled`. Он выключает конвейер HLS —
 * а превью нужны всегда: без них у врача в библиотеке пустые плитки, и раньше их считал host-cron,
 * который об этом флаге не знал вовсе. Поэтому «disabled» у пересборки очередь превью не гасит.
 */
export async function runTranscodeTick(
  ctx: MediaWorkerTickContext,
): Promise<MediaWorkerTranscodeTickResult> {
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
    return 'disabled';
  }
  return 'idle';
}

export async function runPreviewTick(
  ctx: MediaWorkerTickContext,
): Promise<MediaWorkerPreviewTickResult> {
  const preview = await ctx.control.previewClaim(ctx.previewLeaseMinutes);
  if (preview.kind !== 'claimed') return 'idle';
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
