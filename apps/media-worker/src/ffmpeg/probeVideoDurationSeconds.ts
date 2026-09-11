import { ffprobePathFromFfmpeg, runProbe } from './runProbe.js';

export { ffprobePathFromFfmpeg };

const DURATION_RE = /Duration:\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/;

export function parsePositiveVideoDurationSeconds(raw: string): number | null {
  const seconds = Number.parseFloat(raw);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

function parseDurationLine(stderr: string): number | null {
  const m = DURATION_RE.exec(stderr);
  if (!m) return null;
  const hours = Number.parseInt(m[1]!, 10);
  const minutes = Number.parseInt(m[2]!, 10);
  const seconds = parsePositiveVideoDurationSeconds(m[3]!);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || seconds === null) return null;
  const total = hours * 3600 + minutes * 60 + seconds;
  if (total <= 0) return null;
  return total;
}

/** Preserve the existing whole-second storage contract after making policy checks precise. */
export function roundVideoDurationSecondsForStorage(seconds: number | null): number | null {
  return seconds === null ? null : Math.max(1, Math.round(seconds));
}

/**
 * Best-effort precise duration in seconds from a local media file (ffprobe, then ffmpeg -i).
 */
export async function probeVideoDurationSeconds(
  ffmpegBin: string,
  inputPath: string,
  timeoutMs = 60_000,
): Promise<number | null> {
  const ffprobeBin = ffprobePathFromFfmpeg(ffmpegBin);
  try {
    const ffprobe = await runProbe(
      ffprobeBin,
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        inputPath,
      ],
      timeoutMs,
    );
    if (ffprobe.code === 0) {
      const raw = ffprobe.stdout.trim().split('\n')[0]?.trim() ?? '';
      const durationSeconds = parsePositiveVideoDurationSeconds(raw);
      if (durationSeconds !== null) return durationSeconds;
    }
  } catch {
    /* ffprobe missing or failed — try ffmpeg */
  }

  try {
    const ffmpeg = await runProbe(
      ffmpegBin,
      ['-hide_banner', '-i', inputPath, '-f', 'null', '-'],
      timeoutMs,
    );
    return parseDurationLine(ffmpeg.stderr);
  } catch {
    return null;
  }
}
