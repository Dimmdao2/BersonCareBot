import { createLogger } from "./logger.js";
import { loadMediaWorkerEnv } from "./env.js";
import { createMediaWorkerPoolProvider } from "./poolProvider.js";
import { createS3Client } from "./s3.js";
import { runMediaWorkerTick } from "./workerTick.js";
import { createMediaWorkerIsolationReporter } from "./saasIsolationTelemetry.js";
import { runWithMediaWorkerInfraPrincipal } from "./runMediaWorkerSql.js";
import { startMediaWorkerTransaction } from "./withClient.js";
import {
  captureErrorTrackingException,
  closeErrorTracking,
  initErrorTracking,
} from "@bersoncare/error-tracking";
import { readServerRuntimeString } from "./serverRuntimeConfig.js";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const env = loadMediaWorkerEnv();
  const log = createLogger(env);
  const pool = createMediaWorkerPoolProvider({ connectionString: env.DATABASE_URL });
  await runWithMediaWorkerInfraPrincipal("media-worker:tick", async () => {
    const tx = await startMediaWorkerTransaction(pool);
    try {
      await tx.client.query("SELECT 1 FROM public.media_transcode_jobs WHERE false");
      await tx.client.query("SELECT 1 FROM public.media_files WHERE false");
      await tx.client.query("SELECT app.read_media_worker_runtime_setting('video_hls_pipeline_enabled')");
      await tx.rollback();
    } catch (error) {
      try {
        await tx.rollback();
      } catch {
        // Preserve the readiness failure; client cleanup below still destroys on cleanup failure.
      }
      throw error;
    } finally {
      await tx.release();
    }
  });
  try {
    const [enabled, dsn] = await Promise.all([
      readServerRuntimeString(pool, "error_tracking_enabled"),
      readServerRuntimeString(pool, "error_tracking_dsn"),
    ]);
    await initErrorTracking({
      enabled: enabled === "true",
      dsn,
      service: "media-worker",
      processRole: "media-worker",
    });
  } catch {
    // Optional telemetry must never affect media readiness.
  }
  const isolationTelemetry = createMediaWorkerIsolationReporter(env.DATABASE_URL);
  const s3Client = createS3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
    bucket: env.S3_PRIVATE_BUCKET,
    forcePathStyle: env.S3_FORCE_PATH_STYLE ?? false,
  });

  const ctx = {
    pool,
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
    log.info({ signal }, "shutdown requested");
    shuttingDown = true;
  };
  process.on("SIGTERM", () => onStop("SIGTERM"));
  process.on("SIGINT", () => onStop("SIGINT"));

  log.info({ lockId: env.lockId }, "media-worker started");

  while (!shuttingDown) {
    try {
      const result = await runMediaWorkerTick(ctx);
      if (result === "disabled") {
        await sleep(env.POLL_MS * 3);
        continue;
      }
      if (result === "idle") {
        await sleep(env.POLL_MS);
        continue;
      }
    } catch (e) {
      captureErrorTrackingException(e, "media_worker_loop_error");
      isolationTelemetry.report(e);
      log.error({ err: e }, "main loop error");
      await sleep(env.POLL_MS);
    }
  }

  await pool.end();
  await isolationTelemetry.close();
  await closeErrorTracking(1_500);
  log.info("media-worker stopped");
}

main().catch((e) => {
  captureErrorTrackingException(e, "media_worker_startup_fatal");
  console.error("media-worker fatal");
  void closeErrorTracking(1_500).finally(() => {
    process.exitCode = 1;
  });
});
