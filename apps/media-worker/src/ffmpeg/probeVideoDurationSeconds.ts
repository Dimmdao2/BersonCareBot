import { spawn } from 'node:child_process';

const DURATION_RE = /Duration:\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/;

export function parsePositiveVideoDurationSeconds(raw: string): number | null {
  const seconds = Number.parseFloat(raw);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

/** Derive ffprobe path from ffmpeg binary path when co-installed. */
export function ffprobePathFromFfmpeg(ffmpegBin: string): string {
  if (ffmpegBin.endsWith('ffmpeg')) return `${ffmpegBin.slice(0, -6)}ffprobe`;
  return ffmpegBin.replace(/ffmpeg$/, 'ffprobe');
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

async function runProbe(
  bin: string,
  args: string[],
  timeoutMs: number,
): Promise<{ code: number; stdout: string; stderr: string }> {
  const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', (chunk: Buffer) => {
    stdout += chunk.toString('utf8');
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString('utf8');
  });
  const exitPromise = new Promise<number>((resolve, reject) => {
    child.once('exit', (code) => resolve(code ?? 1));
    child.once('error', reject);
  });
  const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
  try {
    const code = await exitPromise;
    return { code, stdout, stderr };
  } finally {
    clearTimeout(timer);
  }
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
