import { readFile, rm } from 'node:fs/promises';
import { buildPosterFfmpegArgs } from './hlsArgs.js';
import { runFfmpeg } from './runFfmpeg.js';

export async function extractPosterWithFallback(params: {
  ffmpegBin: string;
  inputFile: string;
  outputJpg: string;
  videoFilter?: string;
  cwd: string;
  timeoutMs: number;
}): Promise<void> {
  let lastError = 'ffmpeg_poster_missing_output';

  for (const seekSeconds of [1, 0]) {
    await rm(params.outputJpg, { force: true });
    const run = await runFfmpeg(
      params.ffmpegBin,
      buildPosterFfmpegArgs(params.inputFile, params.outputJpg, params.videoFilter, seekSeconds),
      {
        cwd: params.cwd,
        timeoutMs: params.timeoutMs,
        collectStderrMaxBytes: 16384,
      },
    );
    if (run.code !== 0) {
      lastError = `ffmpeg_poster_exit_${run.code}_at_${seekSeconds}s: ${run.stderrTail}`;
      continue;
    }

    const poster = await readFile(params.outputJpg).catch(() => null);
    if (poster && poster.length > 0) return;
    lastError = `ffmpeg_poster_missing_output_at_${seekSeconds}s`;
  }

  throw new Error(lastError);
}
