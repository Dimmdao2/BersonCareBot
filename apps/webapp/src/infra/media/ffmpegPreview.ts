import { spawn } from 'node:child_process';

/**
 * Прямой запуск системных `ffmpeg`/`ffprobe` для preview-воркера webapp.
 *
 * Движок обработки видео не меняется — это по-прежнему системный FFmpeg. Ушла только
 * неподдерживаемая Node-обёртка `fluent-ffmpeg`: argv собирается здесь, `shell` не используется,
 * процесс убивается по таймауту, stderr читается с ограничением.
 *
 * Тексты ошибок повторяют формулировки `fluent-ffmpeg` дословно
 * (`ffmpeg exited with code N: …`, `ffmpeg was killed with signal SIG…`): по ним
 * `mediaPreviewWorker` отличает постоянную ошибку файла от временной и решает `skipped` vs retry.
 *
 * Переиспользовать `apps/media-worker/src/ffmpeg/**` нельзя: webapp не зависит от
 * `@bersoncare/media-worker` (пакет ничего не экспортирует и собирается как приложение), его
 * исходники используют `.js`-специфиеры, а Next.js production build не должен их тянуть — тот же
 * запрет уже зафиксирован в `apps/webapp/src/app-layer/integrator/messengerPhoneHttpBindExecute.ts`.
 * Плюс здесь другой вход (пере-подписываемый presigned URL, не локальный файл с `cwd`), другое
 * качество кадра (`-q:v 3`) и ffprobe нужен для размеров, а не для длительности.
 */

export type ProcessRunResult = {
  code: number;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderrTail: string;
  /** Процесс не завершился за отведённое время и был убит SIGKILL. */
  timedOut: boolean;
};

export type ProcessRunOptions = {
  timeoutMs: number;
  maxStderrBytes: number;
  maxStdoutBytes: number;
};

export type ProcessRunner = (
  bin: string,
  args: string[],
  options: ProcessRunOptions,
) => Promise<ProcessRunResult>;

/** `ffmpeg` пишет отчёт в stderr, поэтому хвоста достаточно и для диагностики, и для матчинга. */
export const FFMPEG_STDERR_TAIL_BYTES = 16_384;
/** ffprobe отдаёт компактный JSON только по width/height. */
export const FFPROBE_STDOUT_MAX_BYTES = 256 * 1024;

/** Кадр постера: `-ss` до `-i` (быстрый seek), один кадр, качество как было у fluent-ffmpeg. */
export function buildPosterArgs(input: string, outPath: string, seekSeconds: number): string[] {
  return ['-y', '-ss', String(seekSeconds), '-i', input, '-frames:v', '1', '-q:v', '3', outPath];
}

/** Размеры всех потоков контейнера — выбор наибольшего остаётся за вызывающим. */
export function buildProbeDimensionsArgs(input: string): string[] {
  return [
    '-v',
    'error',
    '-show_entries',
    'stream=width,height',
    '-of',
    'json',
    input,
  ];
}

export type ProbedStream = { width?: unknown; height?: unknown };

/** Тот же выбор, что делал прежний код поверх `ffmpeg.ffprobe`: поток с наибольшей площадью. */
export function pickLargestStreamDimensions(
  streams: readonly ProbedStream[],
): { width: number; height: number } | null {
  const withDims = streams.filter(
    (s): s is { width: number; height: number } =>
      typeof s.width === 'number' &&
      typeof s.height === 'number' &&
      s.width > 0 &&
      s.height > 0,
  );
  if (withDims.length === 0) return null;
  const best = withDims.reduce((a, b) => (a.width * a.height >= b.width * b.height ? a : b));
  return { width: best.width, height: best.height };
}

export function parseProbeDimensions(stdout: string): { width: number; height: number } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return null;
  }
  const streams = (parsed as { streams?: unknown })?.streams;
  if (!Array.isArray(streams)) return null;
  return pickLargestStreamDimensions(streams as ProbedStream[]);
}

/**
 * Дословные формулировки `fluent-ffmpeg`: `mediaPreviewWorker.PERMANENT_ERROR_PATTERNS` сверяет
 * подстроки `was killed with signal SIGSEGV` и `Invalid data found when processing input`.
 */
export function ffmpegFailureMessage(result: ProcessRunResult, binaryLabel = 'ffmpeg'): string {
  if (result.signal) return `${binaryLabel} was killed with signal ${result.signal}`;
  return `${binaryLabel} exited with code ${result.code}: ${result.stderrTail}`;
}

/**
 * Порядок поиска `ffprobe` повторяет прежний (`fluent-ffmpeg`): переменная окружения, затем
 * бинарь из PATH, затем сосед указанного `ffmpeg`.
 */
export function ffprobeCandidates(ffmpegPath: string, ffprobeEnvPath?: string): string[] {
  const explicit = ffprobeEnvPath?.trim();
  if (explicit) return [explicit];
  const candidates = ['ffprobe'];
  const sibling = ffmpegPath.trim().replace(/ffmpeg(\.exe)?$/u, (m) => m.replace('ffmpeg', 'ffprobe'));
  if (sibling && sibling !== ffmpegPath.trim() && !candidates.includes(sibling)) {
    candidates.push(sibling);
  }
  return candidates;
}

/** Запуск без shell: argv передаётся массивом, интерполяции в командную строку нет. */
export const runProcess: ProcessRunner = (bin, args, options) =>
  new Promise<ProcessRunResult>((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: false });
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    if (options.maxStdoutBytes > 0) {
      child.stdout?.on('data', (chunk: Buffer) => {
        stdout = (stdout + chunk.toString('utf8')).slice(-options.maxStdoutBytes);
      });
    } else {
      child.stdout?.resume();
    }
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString('utf8')).slice(-options.maxStderrBytes);
    });

    const killTimer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, options.timeoutMs);

    child.once('error', (err) => {
      clearTimeout(killTimer);
      reject(err);
    });
    child.once('close', (code, signal) => {
      clearTimeout(killTimer);
      resolve({ code: code ?? 1, signal, stdout, stderrTail: stderr, timedOut });
    });
  });

/** Первый кандидат, который вообще удалось запустить: отсутствующий бинарь (ENOENT) — не отказ. */
export async function runFirstAvailable(
  candidates: readonly string[],
  args: string[],
  options: ProcessRunOptions,
  runner: ProcessRunner = runProcess,
): Promise<ProcessRunResult> {
  let lastError: unknown = new Error('no_binary_candidates');
  for (const bin of candidates) {
    try {
      return await runner(bin, args, options);
    } catch (e) {
      lastError = e;
      if ((e as NodeJS.ErrnoException)?.code !== 'ENOENT') throw e;
    }
  }
  throw lastError;
}
