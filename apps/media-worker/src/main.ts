import { createLogger } from './logger.js';
import { loadMediaWorkerEnv } from './env.js';
import { createS3Client } from './s3.js';
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
  const s3Client = createS3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
    bucket: env.S3_PRIVATE_BUCKET,
    forcePathStyle: env.S3_FORCE_PATH_STYLE ?? false,
  });

  const ctx = {
    control,
    s3Client,
    bucket: env.S3_PRIVATE_BUCKET,
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
