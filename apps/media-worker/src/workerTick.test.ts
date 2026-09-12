import { describe, expect, it, vi } from 'vitest';
import type { MediaPreviewOrder, MediaWorkerControlPort } from './control.js';
import type { MediaWorkerTickContext } from './workerTick.js';

const processTranscodeJob = vi.fn(async () => undefined);
vi.mock('./processTranscodeJob.js', () => ({ processTranscodeJob }));
const processPreviewOrder = vi.fn(async () => 'processed' as const);
vi.mock('./processPreviewJob.js', () => ({ processPreviewOrder }));
const { runMediaWorkerTick } = await import('./workerTick.js');

function context(control: MediaWorkerControlPort): MediaWorkerTickContext {
  return {
    control,
    lockId: 'worker-a',
    staleLockMinutes: 30,
    previewLeaseMinutes: 15,
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
  } as unknown as MediaWorkerTickContext;
}

const idlePreview: MediaWorkerControlPort['previewClaim'] = vi.fn(async () => ({
  kind: 'idle' as const,
}));

function control(
  claim: MediaWorkerControlPort['claim'],
  previewClaim: MediaWorkerControlPort['previewClaim'] = idlePreview,
): MediaWorkerControlPort {
  return {
    ready: vi.fn(), errorTrackingConfig: vi.fn(), isolationFailure: vi.fn(), claim, load: vi.fn(), watermarkEnabled: vi.fn(), processing: vi.fn(), retry: vi.fn(),
    failed: vi.fn(), doneHls: vi.fn(), doneProgram: vi.fn(),
    previewClaim, previewHostedBytes: vi.fn(), previewDoneImage: vi.fn(), previewDonePoster: vi.fn(),
    previewFailed: vi.fn(), previewTick: vi.fn(),
  };
}

const previewOrder: MediaPreviewOrder = {
  mediaId: 'media-9',
  attempts: 0,
  storageTarget: 'patient',
  plan: { kind: 'image', sourceKey: 'media/media-9/source.jpg' },
  standardKey: 'media/media-9/standard.webp',
  smKey: 'previews/sm/media-9.jpg',
  mdKey: 'previews/md/media-9.jpg',
};
const claimedPreview: MediaWorkerControlPort['previewClaim'] = vi.fn(async () => ({
  kind: 'claimed' as const,
  order: previewOrder,
}));

describe('runMediaWorkerTick', () => {
  it('does not process a disabled or idle queue, and processes exactly one claimed job', async () => {
    const disabledClaim: MediaWorkerControlPort['claim'] = vi.fn(async () => ({ kind: 'disabled' as const }));
    const disabled = control(disabledClaim);
    await expect(runMediaWorkerTick(context(disabled))).resolves.toBe('disabled');
    const idleClaim: MediaWorkerControlPort['claim'] = vi.fn(async () => ({ kind: 'idle' as const }));
    const idle = control(idleClaim);
    await expect(runMediaWorkerTick(context(idle))).resolves.toBe('idle');
    const claimedClaim: MediaWorkerControlPort['claim'] = vi.fn(async () => ({ kind: 'claimed' as const, job: { id: 'job-1', mediaId: 'media-1', organizationId: 'org-1', attempts: 1 } }));
    const claimed = control(claimedClaim);
    await expect(runMediaWorkerTick(context(claimed))).resolves.toBe('processed');
    expect(processTranscodeJob).toHaveBeenCalledTimes(1);
    expect(claimedClaim).toHaveBeenCalledWith('worker-a', 30);
  });

  it('propagates a control failure instead of treating it as disabled, idle, or processed', async () => {
    const failure = new Error('control unavailable');
    const rejectedClaim: MediaWorkerControlPort['claim'] = vi.fn(async () => {
      throw failure;
    });

    await expect(runMediaWorkerTick(context(control(rejectedClaim)))).rejects.toBe(failure);
  });

  /*
   * Флаг `video_hls_pipeline_enabled` выключает конвейер HLS. Превью он не касается: до переезда
   * их считал host-cron, который об этом флаге не знал. Оставить очередь превью за этим флагом
   * значило бы, что выключение HLS молча гасит и плитки в библиотеке врача.
   */
  it('takes a preview order even when the HLS pipeline is disabled', async () => {
    processPreviewOrder.mockClear();
    const disabledClaim: MediaWorkerControlPort['claim'] = vi.fn(async () => ({ kind: 'disabled' as const }));

    await expect(
      runMediaWorkerTick(context(control(disabledClaim, claimedPreview))),
    ).resolves.toBe('preview_processed');
    expect(processPreviewOrder).toHaveBeenCalledTimes(1);
    expect(claimedPreview).toHaveBeenCalledWith(15);
  });

  /* Пересборка видео идёт первой: превью берутся только тогда, когда её очередь пуста. */
  it('does not touch the preview queue while a transcode job is claimed', async () => {
    processPreviewOrder.mockClear();
    const preview = vi.fn(async () => ({ kind: 'idle' as const }));
    const claimedClaim: MediaWorkerControlPort['claim'] = vi.fn(async () => ({ kind: 'claimed' as const, job: { id: 'job-2', mediaId: 'media-2', organizationId: 'org-1', attempts: 0 } }));

    await expect(runMediaWorkerTick(context(control(claimedClaim, preview)))).resolves.toBe('processed');
    expect(preview).not.toHaveBeenCalled();
    expect(processPreviewOrder).not.toHaveBeenCalled();
  });

  it('reports a failed preview order as an error outcome, not as idle', async () => {
    processPreviewOrder.mockClear();
    processPreviewOrder.mockResolvedValueOnce('error' as never);
    const idleClaim: MediaWorkerControlPort['claim'] = vi.fn(async () => ({ kind: 'idle' as const }));

    await expect(
      runMediaWorkerTick(context(control(idleClaim, claimedPreview))),
    ).resolves.toBe('preview_error');
  });
});
