import { NextResponse } from 'next/server';
import { z } from 'zod';
import { enterWithDbInfraPrincipal } from '@bersoncare/db-principal';
import { SAAS_ISOLATION_EVENT_CLASSES } from '@bersoncare/error-tracking';
import { verifyInternalJobBearer } from '@/middleware/internalJobBearer';
import { logger } from '@/app-layer/logging/logger';
import {
  assertMediaWorkerControlReady, claimMediaPreviewOrder, claimMediaWorkerControlJob,
  completeMediaPreviewImage, completeMediaPreviewPoster, completeMediaWorkerHlsJob,
  completeMediaWorkerProgramJob, failMediaPreview, failMediaWorkerJob, loadMediaWorkerControlMedia,
  markMediaWorkerProcessing, readMediaPreviewHostedBytes, readMediaWorkerErrorTrackingConfig,
  readMediaWorkerWatermarkEnabled, recordMediaPreviewTick, reportMediaWorkerIsolationFailure,
  retryMediaWorkerJob,
} from '@/app-layer/media/mediaWorkerControl';

const jobSchema = z.object({ id: z.string().uuid(), mediaId: z.string().uuid() }).strict();
// Wire contract of the media control seam: the same closed class list the classifier produces.
const isolationEventSchema = z.enum(SAAS_ISOLATION_EVENT_CLASSES);
const commandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready') }),
  z.object({ type: z.literal('watermark') }),
  z.object({ type: z.literal('error_tracking_config') }),
  z.object({ type: z.literal('isolation_failure'), eventClass: isolationEventSchema }),
  z.object({ type: z.literal('claim'), lockedBy: z.string().min(1).max(200), staleLockMinutes: z.number().int().positive().max(24 * 60) }),
  z.object({ type: z.literal('load'), job: jobSchema, lockedBy: z.string().min(1).max(200) }),
  z.object({ type: z.literal('processing'), job: jobSchema, lockedBy: z.string().min(1).max(200) }),
  z.object({ type: z.literal('retry'), job: jobSchema, lockedBy: z.string().min(1).max(200), nextAttemptAt: z.string().datetime(), error: z.string().max(8000) }),
  z.object({ type: z.literal('failed'), job: jobSchema, lockedBy: z.string().min(1).max(200), error: z.string().max(8000) }),
  z.object({ type: z.literal('done_hls'), job: jobSchema, lockedBy: z.string().min(1).max(200), values: z.object({ masterKey: z.string().max(2000).optional(), artifactPrefix: z.string().max(2000).optional(), posterKey: z.string().max(2000).optional(), qualitiesJson: z.string().max(8000).optional(), durationSeconds: z.number().nonnegative().nullable().optional() }) }),
  z.object({ type: z.literal('done_program'), job: jobSchema, lockedBy: z.string().min(1).max(200), values: z.object({ outputKey: z.string().min(1).max(2000), posterKey: z.string().min(1).max(2000), qualitiesJson: z.string().max(8000), durationSeconds: z.number().nonnegative().nullable() }) }),
  /*
   * Очередь превью (М7, `docs/_TODO/STORAGE_PACKAGES_2026-09-10.md`). Тот же шов и тот же
   * принципал, что у пересборки видео: воркер занимает наряд, разбирает байты у себя и
   * отчитывается об исходе. Ни один ключ объекта в отчёте НЕ передаётся: и ключи вывода, и
   * вытесненный исходник вебапп считает сам от `mediaId` и от текущей строки.
   */
  z.object({ type: z.literal('preview_claim'), leaseMinutes: z.number().int().positive().max(24 * 60) }),
  z.object({ type: z.literal('preview_hosted_bytes'), mediaId: z.string().uuid() }),
  z.object({ type: z.literal('preview_done_image'), mediaId: z.string().uuid(), values: z.object({ mimeType: z.string().min(1).max(200), sizeBytes: z.number().int().nonnegative(), width: z.number().int().positive(), height: z.number().int().positive() }) }),
  z.object({ type: z.literal('preview_done_poster'), mediaId: z.string().uuid(), values: z.object({ width: z.number().int().positive().nullable(), height: z.number().int().positive().nullable() }) }),
  z.object({ type: z.literal('preview_failed'), mediaId: z.string().uuid(), error: z.string().max(8000) }),
  z.object({ type: z.literal('preview_tick'), processed: z.number().int().nonnegative(), errors: z.number().int().nonnegative(), durationMs: z.number().int().nonnegative() }),
]);

export async function POST(request: Request) {
  const auth = verifyInternalJobBearer(request);
  if (!auth.ok) return auth.response;
  enterWithDbInfraPrincipal({ source: 'api/internal/media-worker/control:POST' });
  const parsed = commandSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  try {
    const command = parsed.data;
    switch (command.type) {
      case 'ready': await assertMediaWorkerControlReady(); return NextResponse.json({ ok: true, result: null });
      case 'watermark': return NextResponse.json({ ok: true, result: await readMediaWorkerWatermarkEnabled() });
      case 'error_tracking_config': return NextResponse.json({ ok: true, result: await readMediaWorkerErrorTrackingConfig() });
      case 'isolation_failure': await reportMediaWorkerIsolationFailure(command.eventClass); break;
      case 'claim': return NextResponse.json({ ok: true, result: await claimMediaWorkerControlJob(command.lockedBy, command.staleLockMinutes) });
      case 'load': return NextResponse.json({ ok: true, result: await loadMediaWorkerControlMedia(command.job, command.lockedBy) });
      case 'processing': await markMediaWorkerProcessing(command.job, command.lockedBy); break;
      case 'retry': await retryMediaWorkerJob(command.job, command.lockedBy, command.nextAttemptAt, command.error); break;
      case 'failed': await failMediaWorkerJob(command.job, command.lockedBy, command.error); break;
      case 'done_hls': await completeMediaWorkerHlsJob(command.job, command.lockedBy, command.values); break;
      case 'done_program': await completeMediaWorkerProgramJob(command.job, command.lockedBy, command.values); break;
      case 'preview_claim': return NextResponse.json({ ok: true, result: await claimMediaPreviewOrder(command.leaseMinutes) });
      case 'preview_hosted_bytes': return NextResponse.json({ ok: true, result: await readMediaPreviewHostedBytes(command.mediaId) });
      case 'preview_done_image': await completeMediaPreviewImage({ mediaId: command.mediaId, ...command.values }); break;
      case 'preview_done_poster': await completeMediaPreviewPoster({ mediaId: command.mediaId, ...command.values }); break;
      case 'preview_failed': await failMediaPreview(command.mediaId, command.error); break;
      case 'preview_tick': await recordMediaPreviewTick({ processed: command.processed, errors: command.errors, durationMs: command.durationMs }); break;
    }
    return NextResponse.json({ ok: true, result: null });
  } catch (error) {
    logger.error({ err: error, command: parsed.data.type }, '[internal/media-worker/control] failed');
    return NextResponse.json({ ok: false, error: 'control_failed' }, { status: 409 });
  }
}
