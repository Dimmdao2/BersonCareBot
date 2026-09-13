import { createLogger } from './logger.js';
import { loadMediaWorkerEnv } from './env.js';
import { buildMediaWorkerStorageBindings } from './storageBindings.js';
import { runPreviewTick, runTranscodeTick } from './workerTick.js';
import { createHttpMediaWorkerControl } from './control.js';
import {
  captureMediaWorkerLoopError,
  captureMediaWorkerStartupFatal,
  closeMediaWorkerErrorTracking,
  initMediaWorkerErrorTracking,
} from './errorTracking.js';
import { createMediaWorkerIsolationReporter } from './saasIsolationTelemetry.js';
import { createPreviewHeartbeat } from './previewHeartbeat.js';
import { resolveMagickCommand } from './magickConvert.js';

/** Раз в минуту при потолке протухания строки «Превью медиа» в три минуты. */
const PREVIEW_HEARTBEAT_INTERVAL_MS = 60_000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const env = loadMediaWorkerEnv();
  const log = createLogger(env);
  const control = createHttpMediaWorkerControl({
    baseUrl: env.MEDIA_WORKER_CONTROL_URL,
    secret: env.INTERNAL_JOB_SECRET,
    timeoutMs: env.MEDIA_WORKER_CONTROL_TIMEOUT_MS,
  });
  await control.ready();
  await initMediaWorkerErrorTracking(control);
  const isolationReporter = createMediaWorkerIsolationReporter(control);
  const { storageFor, sourceStorageFor } = buildMediaWorkerStorageBindings(env);

  const ctx = {
    control,
    storageFor,
    sourceStorageFor,
    ffmpegBin: env.ffmpegPathResolved,
    ffmpegTimeoutMs: env.FFMPEG_TIMEOUT_MS,
    maxAttempts: env.MAX_TRANSCODE_ATTEMPTS,
    log,
    lockId: env.lockId,
    staleLockMinutes: env.STALE_LOCK_MINUTES,
    previewTimeoutMs: env.PREVIEW_TIMEOUT_MS,
    previewLeaseMinutes: env.PREVIEW_LEASE_MINUTES,
    magickCandidates: resolveMagickCommand(env.MAGICK_PATH),
  };

  const previewHeartbeat = createPreviewHeartbeat({
    report: (values) => control.previewTick(values),
    intervalMs: PREVIEW_HEARTBEAT_INTERVAL_MS,
  });

  let shuttingDown = false;
  const onStop = (signal: string) => {
    log.info({ signal }, 'shutdown requested');
    shuttingDown = true;
  };
  process.on('SIGTERM', () => onStop('SIGTERM'));
  process.on('SIGINT', () => onStop('SIGINT'));

  log.info({ lockId: env.lockId }, 'media-worker started');

  const onLoopError = (e: unknown, loop: string) => {
    captureMediaWorkerLoopError(e);
    isolationReporter.report(e);
    log.error({ err: e, loop }, 'main loop error');
  };

  /*
   * Три независимых цикла в одном процессе. Пересборка видео занимает оборот надолго — потолок
   * `FFMPEG_TIMEOUT_MS` равен двум часам, — поэтому очередь превью и отметка живости не имеют права
   * ждать её хвоста: до переезда с host-cron превью считала отдельная дверь, и чужая перекодировка
   * им не мешала. Держать их в одном обороте значило бы и гасить плитки в библиотеке врача на всё
   * время перекодировки, и зажигать владельцу ложное «Превью медиа устарело» (независимый аудит
   * 13.09). Очереди разные, аренды разные — параллельный заход безопасен.
   */
  const transcodeLoop = async () => {
    while (!shuttingDown) {
      try {
        const result = await runTranscodeTick(ctx);
        if (result === 'disabled') {
          await sleep(env.POLL_MS * 3);
          continue;
        }
        if (result === 'idle') await sleep(env.POLL_MS);
      } catch (e) {
        onLoopError(e, 'transcode');
        await sleep(env.POLL_MS);
      }
    }
  };

  const previewLoop = async () => {
    while (!shuttingDown) {
      try {
        const startedAt = Date.now();
        const result = await runPreviewTick(ctx);
        previewHeartbeat.record(result, Date.now() - startedAt);
        if (result === 'idle') await sleep(env.POLL_MS);
      } catch (e) {
        onLoopError(e, 'preview');
        await sleep(env.POLL_MS);
      }
    }
  };

  /*
   * Отметка ставится и в простое: строка «Превью медиа» — про живость воркера, а не про то,
   * нашлась ли ему работа. Отказ самой отметки не должен ронять цикл. Шаг сна мелкий, чтобы
   * остановка воркера не ждала целое окно отметки.
   */
  const heartbeatLoop = async () => {
    const step = Math.min(env.POLL_MS, PREVIEW_HEARTBEAT_INTERVAL_MS);
    while (!shuttingDown) {
      await previewHeartbeat
        .reportIfDue()
        .catch((e) => log.warn({ err: e }, 'preview heartbeat failed'));
      await sleep(step);
    }
  };

  await Promise.all([transcodeLoop(), previewLoop(), heartbeatLoop()]);

  await closeMediaWorkerErrorTracking();
  log.info('media-worker stopped');
}

main().catch((e) => {
  captureMediaWorkerStartupFatal(e);
  console.error('media-worker fatal');
  process.exitCode = 1;
});
