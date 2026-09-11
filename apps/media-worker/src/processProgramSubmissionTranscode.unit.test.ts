import { writeFile } from 'node:fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClaimedJob, MediaWorkerControlPort } from './control.js';
import type { StorageBinding } from './s3.js';
import type { TranscodeJobContext } from './processTranscodeJob.js';

/**
 * Correction stage canary (independent audit `raw-bucket-audit-01`, item 5): before this file, this
 * naряд had ZERO tests. The audit injected the exact same two breakages against the worker's 114
 * existing tests and got 0 red on both:
 *
 * INJ5 — the patient-submitted source is never deleted after a successful 480p conversion (reverts
 *        the owner's 11.09.2026 decision, already broken once and fixed by `b1e1ad9d1`).
 * INJ6 — the delete targets `ctx.source` (the download binding) instead of `ctx.bucket` (the output
 *        binding the code actually deletes from — currently correct, only aliased to look safe
 *        because `patient` isn't split by M7).
 *
 * Both are proven here by asserting the real `DeleteObjectCommand` the code sends, not a fixture.
 */

const fakes = vi.hoisted(() => ({
  downloadObjectToFile: vi.fn(),
  headObjectExists: vi.fn(),
  putObjectWithRetry: vi.fn(),
  runFfmpeg: vi.fn(),
  extractPosterWithFallback: vi.fn(),
  probeVideoDurationSeconds: vi.fn(),
}));

vi.mock('./s3.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./s3.js')>();
  return {
    ...actual,
    downloadObjectToFile: fakes.downloadObjectToFile,
    headObjectExists: fakes.headObjectExists,
    putObjectWithRetry: fakes.putObjectWithRetry,
  };
});
vi.mock('./ffmpeg/runFfmpeg.js', () => ({ runFfmpeg: fakes.runFfmpeg }));
vi.mock('./ffmpeg/extractPosterWithFallback.js', () => ({
  extractPosterWithFallback: fakes.extractPosterWithFallback,
}));
vi.mock('./ffmpeg/probeVideoDurationSeconds.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./ffmpeg/probeVideoDurationSeconds.js')>();
  return { ...actual, probeVideoDurationSeconds: fakes.probeVideoDurationSeconds };
});

const { processProgramSubmissionTranscodeJob } = await import(
  './processProgramSubmissionTranscode.js'
);

const JOB: ClaimedJob = {
  id: '11111111-1111-4111-8111-111111111111',
  mediaId: '22222222-2222-4222-8222-222222222222',
  organizationId: '33333333-3333-4333-8333-333333333333',
  attempts: 1,
};

/* Пациентское хранилище не org-prefixed (М7 его не трогает) — канонический корень `media/<id>`. */
const SOURCE_KEY = `media/${JOB.mediaId}/AUDIT-sub.mov`;

describe('processProgramSubmissionTranscodeJob — санитизация присланного пациентом видео', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.downloadObjectToFile.mockResolvedValue(undefined);
    fakes.headObjectExists.mockResolvedValue(true);
    fakes.putObjectWithRetry.mockResolvedValue(undefined);
    fakes.probeVideoDurationSeconds.mockResolvedValue(30);
    fakes.runFfmpeg.mockImplementation(async (_bin: string, args: string[]) => {
      const outPath = args[args.length - 1]!;
      await writeFile(outPath, Buffer.from('fake-mp4'));
      return { code: 0, stderrTail: '' };
    });
    fakes.extractPosterWithFallback.mockImplementation(
      async (params: { outputJpg: string }) => {
        await writeFile(params.outputJpg, Buffer.from('jpeg'));
      },
    );
  });

  function contextFor() {
    const send = vi.fn().mockResolvedValue({});
    const client = { send } as unknown as StorageBinding['client'];
    const control = {
      processing: vi.fn(async () => undefined),
      doneProgram: vi.fn(async () => undefined),
      failed: vi.fn(async () => undefined),
    } as unknown as MediaWorkerControlPort;
    const ctx = {
      control,
      client,
      bucket: 'hot-bucket',
      source: { client, bucket: 'patient-bucket' },
      log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      lockId: 'worker-a',
      ffmpegBin: '/usr/bin/ffmpeg',
      ffmpegTimeoutMs: 60_000,
      maxAttempts: 3,
    } as unknown as TranscodeJobContext;
    return { ctx, control, send };
  }

  const media = { id: JOB.mediaId, mime_type: 'video/quicktime', s3_key: SOURCE_KEY };

  /**
   * INJ5 oracle: owner ruling 11.09.2026 — "видео пациента... просто в один вариант сконвертировали
   * и исходник удалили". Already regressed once, fixed by `b1e1ad9d1`; had no test guarding it.
   */
  it('удаляет исходник ПОСЛЕ подтверждённой загрузки 480p (не рапортует успех, оставив байты пациента)', async () => {
    const { ctx, control, send } = contextFor();

    await processProgramSubmissionTranscodeJob(ctx, JOB, media);

    expect(control.doneProgram).toHaveBeenCalledTimes(1);
    expect(control.failed).not.toHaveBeenCalled();

    const deleteCalls = send.mock.calls.filter(
      (call) => (call[0] as { constructor: { name: string } }).constructor.name ===
        'DeleteObjectCommand',
    );
    expect(deleteCalls).toHaveLength(1);
  });

  /**
   * INJ6 oracle: the delete must target `ctx.bucket` (the confirmed-uploaded-to binding), the exact
   * command the running code sends today. Asserting the full `.input` pins BOTH the bucket and the
   * key — either one drifting is the same class of leak (F-3's kind).
   */
  it('удаление нацелено в подтверждённый выходной бакет (ctx.bucket) с ключом исходника', async () => {
    const { ctx, send } = contextFor();

    await processProgramSubmissionTranscodeJob(ctx, JOB, media);

    const deleteCall = send.mock.calls.find(
      (call) => (call[0] as { constructor: { name: string } }).constructor.name ===
        'DeleteObjectCommand',
    );
    expect(deleteCall).toBeDefined();
    const command = deleteCall![0] as { input: { Bucket: string; Key: string } };
    expect(command.input).toEqual({ Bucket: 'hot-bucket', Key: SOURCE_KEY });
  });

  it('не удаляет исходник, если сборка 480p не подтвердилась HEAD-ом', async () => {
    const { ctx, control, send } = contextFor();
    fakes.headObjectExists.mockResolvedValue(false);

    await processProgramSubmissionTranscodeJob(ctx, JOB, media);

    expect(control.failed).toHaveBeenCalledTimes(1);
    expect(control.doneProgram).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
