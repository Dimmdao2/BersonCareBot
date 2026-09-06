import { describe, expect, it, vi } from 'vitest';
import type { ClaimedJob, ControlledMedia, MediaWorkerControlPort } from './control.js';
import { processTranscodeJob, type TranscodeContext } from './processTranscodeJob.js';
import type { StorageBinding } from './s3.js';
import { parseStorageTarget } from './storageTarget.js';

/**
 * Наряд называет хранилище — воркер обязан взять именно его.
 *
 * Это не косметика: видео, записанное пациентом по программе, лежит в шифрованном бакете.
 * Воркер скачивает исходник, кладёт рядом HLS и постер и удаляет исходный MP4 — если он
 * возьмёт библиотечное хранилище, работа либо провалится на скачивании, либо (хуже) оставит
 * артефакты пациента в общем бакете.
 */

const JOB: ClaimedJob = {
  id: '11111111-1111-4111-8111-111111111111',
  mediaId: '22222222-2222-4222-8222-222222222222',
  organizationId: '33333333-3333-4333-8333-333333333333',
  attempts: 1,
};

describe('storage target from the webapp control boundary', () => {
  /**
   * WHAT BREAKS: an older or malformed control response omits/corrupts `storageTarget`, and the
   * worker silently processes that job in the library bucket.
   * CONSEQUENCE: patient bytes are read/written/deleted in the wrong store instead of the rollout
   * failing loudly.
   * ORACLE: owner ruling 06.09.2026: forgetting to name the store must be impossible or loud,
   * never silently `library`.
   */
  it.each([undefined, null, '', 'unknown'])('refuses an unnamed/unknown store: %j', (value) => {
    expect(() => parseStorageTarget(value)).toThrow(/storage_target_missing_on_row/u);
  });
});

function contextFor(media: ControlledMedia | null) {
  const bindings: Record<string, StorageBinding> = {
    library: { client: {} as StorageBinding['client'], bucket: 'library-bucket' },
    patient: { client: {} as StorageBinding['client'], bucket: 'patient-bucket' },
  };
  const storageFor = vi.fn((target: 'library' | 'patient') => bindings[target]!);
  const control = {
    load: vi.fn(async () => media),
    failed: vi.fn(async () => undefined),
  } as unknown as MediaWorkerControlPort;
  const ctx = {
    control,
    storageFor,
    ffmpegBin: '/nonexistent/ffmpeg',
    ffmpegTimeoutMs: 1000,
    maxAttempts: 1,
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    lockId: 'worker-a',
  } as unknown as TranscodeContext;
  return { ctx, storageFor, control };
}

function loadedMedia(overrides: Partial<ControlledMedia> = {}): ControlledMedia {
  return {
    id: JOB.mediaId,
    mimeType: 'video/mp4',
    s3Key: `media/${JOB.mediaId}/source.mp4`,
    hlsMasterPlaylistS3Key: null,
    videoProcessingStatus: null,
    videoDurationSeconds: null,
    usagePurpose: null,
    storageTarget: 'library',
    ...overrides,
  };
}

describe('хранилище наряда на пересборку видео', () => {
  it('видео пациента обрабатывается в его шифрованном хранилище', async () => {
    /* Дальше скачивания дело не пойдёт (клиент — заглушка), но выбор уже сделан. */
    const { ctx, storageFor } = contextFor(
      loadedMedia({ storageTarget: 'patient', usagePurpose: 'program_item_submission' }),
    );
    await processTranscodeJob(ctx, JOB).catch(() => undefined);
    expect(storageFor).toHaveBeenCalledWith('patient');
    expect(storageFor).not.toHaveBeenCalledWith('library');
  });

  it('ролик библиотеки обрабатывается в библиотечном хранилище', async () => {
    const { ctx, storageFor } = contextFor(loadedMedia());
    await processTranscodeJob(ctx, JOB).catch(() => undefined);
    expect(storageFor).toHaveBeenCalledWith('library');
    expect(storageFor).not.toHaveBeenCalledWith('patient');
  });

  it('наряд без строки не уводит воркера в чужой бакет', async () => {
    const { ctx, storageFor, control } = contextFor(null);
    await processTranscodeJob(ctx, JOB).catch(() => undefined);
    expect(storageFor).toHaveBeenCalledWith('library');
    expect(control.failed).toHaveBeenCalled();
  });
});
