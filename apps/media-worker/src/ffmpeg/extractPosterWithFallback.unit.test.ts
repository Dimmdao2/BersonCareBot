import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  readFile: vi.fn(),
  rm: vi.fn(),
  runFfmpeg: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  readFile: fakes.readFile,
  rm: fakes.rm,
}));

vi.mock('./runFfmpeg.js', () => ({ runFfmpeg: fakes.runFfmpeg }));

import { extractPosterWithFallback } from './extractPosterWithFallback.js';

const params = {
  ffmpegBin: '/usr/bin/ffmpeg',
  inputFile: '/work/input.mp4',
  outputJpg: '/work/poster.jpg',
  cwd: '/work',
  timeoutMs: 1_000,
};

describe('extractPosterWithFallback', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    fakes.rm.mockResolvedValue(undefined);
  });

  it('retries at the first frame when the one-second seek produces no poster', async () => {
    fakes.runFfmpeg.mockResolvedValue({ code: 0, stderrTail: '' });
    fakes.readFile
      .mockRejectedValueOnce(new Error('missing'))
      .mockResolvedValueOnce(Buffer.from('jpeg'));

    await expect(extractPosterWithFallback(params)).resolves.toBeUndefined();

    expect(fakes.runFfmpeg).toHaveBeenCalledTimes(2);
    expect(fakes.runFfmpeg.mock.calls[0]?.[1]).toContain('1');
    expect(fakes.runFfmpeg.mock.calls[1]?.[1]).toContain('0');
  });

  it('fails instead of accepting a successful ffmpeg exit without an output poster', async () => {
    fakes.runFfmpeg.mockResolvedValue({ code: 0, stderrTail: '' });
    fakes.readFile.mockRejectedValue(new Error('missing'));

    await expect(extractPosterWithFallback(params)).rejects.toThrow(
      'ffmpeg_poster_missing_output_at_0s',
    );
  });
});
