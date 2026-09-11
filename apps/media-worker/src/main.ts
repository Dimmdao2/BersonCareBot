import { createLogger } from './logger.js';
import { loadMediaWorkerEnv } from './env.js';
import { createS3Client, type StorageBinding } from './s3.js';
import type { StorageTarget } from './storageTarget.js';
import { runMediaWorkerTick } from './workerTick.js';
import { createHttpMediaWorkerControl } from './control.js';
import {
  captureMediaWorkerLoopError,
  captureMediaWorkerStartupFatal,
  closeMediaWorkerErrorTracking,
  initMediaWorkerErrorTracking,
} from './errorTracking.js';
import { createMediaWorkerIsolationReporter } from './saasIsolationTelemetry.js';

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
  /*
   * Два хранилища строятся один раз на процесс, а не на наряд: клиент S3 держит пул соединений,
   * и пересоздавать его на каждое видео значило бы платить рукопожатием за каждый файл.
   *
   * Пока `PATIENT_S3_BUCKET` не задан, обе цели — один и тот же объект: окружение без разделения
   * ведёт себя ровно как до его появления.
   */
  const libraryConfig = {
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
    bucket: env.S3_PRIVATE_BUCKET,
    forcePathStyle: env.S3_FORCE_PATH_STYLE ?? false,
  };
  const library: StorageBinding = {
    client: createS3Client(libraryConfig),
    bucket: libraryConfig.bucket,
  };
  const patient: StorageBinding = env.PATIENT_S3_BUCKET
    ? (() => {
        const cfg = {
          endpoint: env.PATIENT_S3_ENDPOINT || libraryConfig.endpoint,
          region: env.PATIENT_S3_REGION || libraryConfig.region,
          accessKeyId: env.PATIENT_S3_ACCESS_KEY || libraryConfig.accessKeyId,
          secretAccessKey: env.PATIENT_S3_SECRET_KEY || libraryConfig.secretAccessKey,
          bucket: env.PATIENT_S3_BUCKET,
          forcePathStyle: env.PATIENT_S3_FORCE_PATH_STYLE ?? libraryConfig.forcePathStyle,
        };
        return { client: createS3Client(cfg), bucket: cfg.bucket };
      })()
    : library;
  /*
   * Сырой бакет загрузок (М7, `docs/_TODO/STORAGE_PACKAGES_2026-09-10.md`): те же эндпоинт и
   * ключи, что у `library` — отдельным провайдером/учёткой владелец его не заводил, — но свой
   * бакет `S3_RAW_BUCKET`. Исходник `library`-видео читается только отсюда; `patient` разделения
   * не получает вовсе (см. `sourceStorageFor` ниже), так что для него источник и назначение —
   * один и тот же объект `patient`, как и до этого разделения.
   */
  const raw: StorageBinding = { client: library.client, bucket: env.S3_RAW_BUCKET };

  const ctx = {
    control,
    storageFor: (target: StorageTarget): StorageBinding =>
      target === 'patient' ? patient : library,
    sourceStorageFor: (target: StorageTarget): StorageBinding =>
      target === 'patient' ? patient : raw,
    ffmpegBin: env.ffmpegPathResolved,
    ffmpegTimeoutMs: env.FFMPEG_TIMEOUT_MS,
    maxAttempts: env.MAX_TRANSCODE_ATTEMPTS,
    log,
    lockId: env.lockId,
    staleLockMinutes: env.STALE_LOCK_MINUTES,
  };

  let shuttingDown = false;
  const onStop = (signal: string) => {
    log.info({ signal }, 'shutdown requested');
    shuttingDown = true;
  };
  process.on('SIGTERM', () => onStop('SIGTERM'));
  process.on('SIGINT', () => onStop('SIGINT'));

  log.info({ lockId: env.lockId }, 'media-worker started');

  while (!shuttingDown) {
    try {
      const result = await runMediaWorkerTick(ctx);
      if (result === 'disabled') {
        await sleep(env.POLL_MS * 3);
        continue;
      }
      if (result === 'idle') {
        await sleep(env.POLL_MS);
        continue;
      }
    } catch (e) {
      captureMediaWorkerLoopError(e);
      isolationReporter.report(e);
      log.error({ err: e }, 'main loop error');
      await sleep(env.POLL_MS);
    }
  }

  await closeMediaWorkerErrorTracking();
  log.info('media-worker stopped');
}

main().catch((e) => {
  captureMediaWorkerStartupFatal(e);
  console.error('media-worker fatal');
  process.exitCode = 1;
});
