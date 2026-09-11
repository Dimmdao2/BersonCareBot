import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClaimedJob, ControlledMedia, MediaWorkerControlPort } from './control.js';
import { deriveEligibleHlsRungs, HLS_RUNG_LADDER } from './processTranscodeJob.js';
import type { StorageBinding } from './s3.js';

/**
 * ORACLE: `VIDEO_DELIVERY_COST_AND_METERING_2026-09-11.md` items 2 and 5a (owner, 11.09.2026):
 * "720 плодятся из 480? Такое надо чистить нахуй" (never upscale a rung above the source) and a
 * ~1600kbps/576p rung between 900 and 2800.
 */
describe('deriveEligibleHlsRungs', () => {
  it('never advertises a rung taller than the source: 480p source gets no 720p and no 576p', () => {
    const rungs = deriveEligibleHlsRungs(854, 480);

    expect(rungs.map((r) => r.label)).toEqual(['360p', '480p']);
    expect(rungs.some((r) => r.height > 480)).toBe(false);
  });

  it('a 1080p source gets the full 450/900/1600/2800 ladder', () => {
    const rungs = deriveEligibleHlsRungs(1920, 1080);

    expect(rungs.map((r) => r.label)).toEqual(['360p', '480p', '576p', '720p']);
    expect(rungs.map((r) => r.bandwidth)).toEqual([450_000, 900_000, 1_600_000, 2_800_000]);
  });

  it('a source at exactly the 720p rung height includes 720p (fits, not exceeds)', () => {
    const rungs = deriveEligibleHlsRungs(1280, 720);
    expect(rungs.map((r) => r.label)).toEqual(['360p', '480p', '576p', '720p']);
  });

  it('a source smaller than the smallest rung still yields exactly one working rung, never upscaled', () => {
    const rungs = deriveEligibleHlsRungs(426, 240);

    expect(rungs).toHaveLength(1);
    expect(rungs[0]!.height).toBe(240);
    expect(rungs[0]!.width).toBe(426);
    // Bitrate profile borrowed from the smallest ladder rung, not invented.
    expect(rungs[0]!.videoBitrate).toBe(HLS_RUNG_LADDER[0]!.videoBitrate);
  });

  it('rounds an odd native size down to even pixels (libx264 requirement) without upscaling', () => {
    const rungs = deriveEligibleHlsRungs(427, 241);
    expect(rungs[0]!.width).toBe(426);
    expect(rungs[0]!.height).toBe(240);
  });
});

const fakes = vi.hoisted(() => ({
  downloadObjectToFile: vi.fn(),
  headObjectExists: vi.fn(),
  putObjectWithRetry: vi.fn(),
  probeVideoDimensions: vi.fn(),
  runFfmpeg: vi.fn(),
  extractPosterWithFallback: vi.fn(),
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
vi.mock('./ffmpeg/probeVideoDimensions.js', () => ({
  probeVideoDimensions: fakes.probeVideoDimensions,
}));
vi.mock('./ffmpeg/runFfmpeg.js', () => ({ runFfmpeg: fakes.runFfmpeg }));
vi.mock('./ffmpeg/extractPosterWithFallback.js', () => ({
  extractPosterWithFallback: fakes.extractPosterWithFallback,
}));

const { processTranscodeJob } = await import('./processTranscodeJob.js');

const JOB: ClaimedJob = {
  id: '11111111-1111-4111-8111-111111111111',
  mediaId: '22222222-2222-4222-8222-222222222222',
  organizationId: '33333333-3333-4333-8333-333333333333',
  attempts: 1,
};

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

/** Fake variant playlist with a fixed, known EXTINF total (12.0s) so duration is asserted exactly. */
const FAKE_VARIANT_PLAYLIST = [
  '#EXTM3U',
  '#EXT-X-VERSION:3',
  '#EXTINF:6.000000,',
  'seg_000.ts',
  '#EXTINF:6.000000,',
  'seg_001.ts',
  '#EXT-X-ENDLIST',
  '',
].join('\n');

describe('processTranscodeJob — table-driven rung ladder end to end', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.downloadObjectToFile.mockResolvedValue(undefined);
    fakes.headObjectExists.mockResolvedValue(true);
    fakes.putObjectWithRetry.mockResolvedValue(undefined);
    fakes.extractPosterWithFallback.mockImplementation(async (params: { outputJpg: string }) => {
      await writeFile(params.outputJpg, Buffer.from('jpeg'));
    });
    fakes.runFfmpeg.mockImplementation(async (_bin: string, _args: string[], opts: { cwd: string }) => {
      await writeFile(join(opts.cwd, 'index.m3u8'), FAKE_VARIANT_PLAYLIST, 'utf8');
      return { code: 0, stderrTail: '' };
    });
  });

  function contextFor() {
    const bindings: Record<string, StorageBinding> = {
      library: { client: { send: vi.fn() } as unknown as StorageBinding['client'], bucket: 'library-bucket' },
      patient: { client: { send: vi.fn() } as unknown as StorageBinding['client'], bucket: 'patient-bucket' },
    };
    const doneHls = vi.fn<MediaWorkerControlPort['doneHls']>(async () => undefined);
    const control = {
      load: vi.fn(async () => loadedMedia()),
      watermarkEnabled: vi.fn(async () => false),
      processing: vi.fn(async () => undefined),
      doneHls,
      retry: vi.fn(async () => undefined),
      failed: vi.fn(async () => undefined),
    } as unknown as MediaWorkerControlPort;
    const ctx = {
      control,
      storageFor: (target: 'library' | 'patient') => bindings[target]!,
      ffmpegBin: '/usr/bin/ffmpeg',
      ffmpegTimeoutMs: 60_000,
      maxAttempts: 3,
      log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      lockId: 'worker-a',
    };
    return { ctx, control, doneHls };
  }

  it('a 480p source produces only 360p/480p — no upscaled 720p, no 576p', async () => {
    fakes.probeVideoDimensions.mockResolvedValue({ width: 854, height: 480 });
    const { ctx, doneHls } = contextFor();

    await processTranscodeJob(ctx as never, JOB);

    const rungDirsUsed = fakes.runFfmpeg.mock.calls.map((call) => call[2].cwd as string);
    expect(rungDirsUsed.some((d) => d.endsWith('/720p'))).toBe(false);
    expect(rungDirsUsed.some((d) => d.endsWith('/576p'))).toBe(false);
    expect(rungDirsUsed.filter((d) => d.endsWith('/360p'))).toHaveLength(1);
    expect(rungDirsUsed.filter((d) => d.endsWith('/480p'))).toHaveLength(1);

    expect(doneHls).toHaveBeenCalledTimes(1);
    const values = doneHls.mock.calls[0]![2] as { qualitiesJson: string; durationSeconds: number };
    const qualities = JSON.parse(values.qualitiesJson) as Array<{ label: string; height: number }>;
    // Quality list matches exactly the rungs actually produced.
    expect(qualities.map((q) => q.label)).toEqual(['360p', '480p']);
    expect(qualities.every((q) => q.height <= 480)).toBe(true);
    // Duration recorded from the produced playlist (2 * 6.0s), not a source probe.
    expect(values.durationSeconds).toBe(12);
  });

  it('a 1080p source produces the full four-rung ladder', async () => {
    fakes.probeVideoDimensions.mockResolvedValue({ width: 1920, height: 1080 });
    const { ctx, doneHls } = contextFor();

    await processTranscodeJob(ctx as never, JOB);

    const rungDirsUsed = fakes.runFfmpeg.mock.calls.map((call) => call[2].cwd as string);
    for (const label of ['360p', '480p', '576p', '720p']) {
      expect(rungDirsUsed.some((d) => d.endsWith(`/${label}`))).toBe(true);
    }
    const values = doneHls.mock.calls[0]![2] as { qualitiesJson: string };
    const qualities = JSON.parse(values.qualitiesJson) as Array<{ label: string }>;
    expect(qualities.map((q) => q.label)).toEqual(['360p', '480p', '576p', '720p']);
  });

  it('a sub-360p source still yields a working single-rung playlist, not a failure', async () => {
    fakes.probeVideoDimensions.mockResolvedValue({ width: 426, height: 240 });
    const { ctx, doneHls, control } = contextFor();

    await processTranscodeJob(ctx as never, JOB);

    expect(control.failed).not.toHaveBeenCalled();
    expect(doneHls).toHaveBeenCalledTimes(1);
    const values = doneHls.mock.calls[0]![2] as { qualitiesJson: string };
    const qualities = JSON.parse(values.qualitiesJson) as Array<{ label: string; height: number }>;
    expect(qualities).toHaveLength(1);
    expect(qualities[0]!.height).toBe(240);
  });
});
