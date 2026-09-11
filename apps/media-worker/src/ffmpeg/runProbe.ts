import { spawn } from 'node:child_process';

/** Derive ffprobe path from ffmpeg binary path when co-installed. */
export function ffprobePathFromFfmpeg(ffmpegBin: string): string {
  if (ffmpegBin.endsWith('ffmpeg')) return `${ffmpegBin.slice(0, -6)}ffprobe`;
  return ffmpegBin.replace(/ffmpeg$/, 'ffprobe');
}

/**
 * Spawn `bin args…`, collect stdout/stderr, SIGKILL on timeout. Shared low-level runner for every
 * ffprobe/`ffmpeg -i` probe (duration, dimensions, …) so each probe adds only its own parsing.
 */
export async function runProbe(
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
