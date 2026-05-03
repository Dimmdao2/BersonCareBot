import { spawn } from "node:child_process";

export type RunFfmpegOptions = {
  cwd?: string;
  timeoutMs: number;
  collectStderrMaxBytes: number;
};

/**
 * Runs ffmpeg; on timeout sends SIGKILL. Returns exit code and tail of stderr for logs.
 */
export async function runFfmpeg(
  ffmpegBin: string,
  args: string[],
  options: RunFfmpegOptions,
): Promise<{ code: number; stderrTail: string }> {
  const child = spawn(ffmpegBin, args, {
    cwd: options.cwd,
    stdio: ["ignore", "ignore", "pipe"],
  });

  let stderr = "";
  const max = options.collectStderrMaxBytes;
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr = (stderr + chunk.toString("utf8")).slice(-max);
  });

  const exitPromise = new Promise<number>((resolve, reject) => {
    child.once("exit", (code) => {
      resolve(code ?? 1);
    });
    child.once("error", reject);
  });

  const timer = setTimeout(() => {
    child.kill("SIGKILL");
  }, options.timeoutMs);

  try {
    const code = await exitPromise;
    return { code, stderrTail: stderr };
  } finally {
    clearTimeout(timer);
  }
}
