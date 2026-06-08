import { spawn } from "node:child_process";

const DURATION_RE = /Duration:\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/;

/** Derive ffprobe path from ffmpeg binary path when co-installed. */
export function ffprobePathFromFfmpeg(ffmpegBin: string): string {
  if (ffmpegBin.endsWith("ffmpeg")) return `${ffmpegBin.slice(0, -6)}ffprobe`;
  return ffmpegBin.replace(/ffmpeg$/, "ffprobe");
}

function parseDurationLine(stderr: string): number | null {
  const m = DURATION_RE.exec(stderr);
  if (!m) return null;
  const hours = Number.parseInt(m[1]!, 10);
  const minutes = Number.parseInt(m[2]!, 10);
  const seconds = Number.parseFloat(m[3]!);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;
  const total = hours * 3600 + minutes * 60 + seconds;
  if (total <= 0) return null;
  return Math.max(1, Math.round(total));
}

async function runProbe(
  bin: string,
  args: string[],
  timeoutMs: number,
): Promise<{ code: number; stdout: string; stderr: string }> {
  const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    stdout += chunk.toString("utf8");
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString("utf8");
  });
  const exitPromise = new Promise<number>((resolve, reject) => {
    child.once("exit", (code) => resolve(code ?? 1));
    child.once("error", reject);
  });
  const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
  try {
    const code = await exitPromise;
    return { code, stdout, stderr };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Best-effort duration in whole seconds from a local media file (ffprobe, then ffmpeg -i).
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
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        /* eslint-disable-next-line no-secrets/no-secrets -- ffprobe output format flag */
        "default=noprint_wrappers=1:nokey=1",
        inputPath,
      ],
      timeoutMs,
    );
    if (ffprobe.code === 0) {
      const raw = ffprobe.stdout.trim().split("\n")[0]?.trim() ?? "";
      const n = Number.parseFloat(raw);
      if (Number.isFinite(n) && n > 0) return Math.max(1, Math.round(n));
    }
  } catch {
    /* ffprobe missing or failed — try ffmpeg */
  }

  try {
    const ffmpeg = await runProbe(
      ffmpegBin,
      ["-hide_banner", "-i", inputPath, "-f", "null", "-"],
      timeoutMs,
    );
    return parseDurationLine(ffmpeg.stderr);
  } catch {
    return null;
  }
}
