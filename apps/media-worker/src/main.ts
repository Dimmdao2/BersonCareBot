import { Pool } from "pg";
import { createLogger } from "./logger.js";
import { loadMediaWorkerEnv } from "./env.js";
import { readPipelineEnabled } from "./pipelineEnabled.js";
import { claimNextJob, reclaimStaleProcessing } from "./jobs/claim.js";
import { processTranscodeJob } from "./processTranscodeJob.js";
import { createS3Client } from "./s3.js";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const env = loadMediaWorkerEnv();
  const log = createLogger(env);
  const pool = new Pool({ connectionString: env.DATABASE_URL, max: 4 });
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
      const enabled = await readPipelineEnabled(pool);
      if (!enabled) {
        log.debug("video_hls_pipeline_enabled is false; idle");
        await sleep(env.POLL_MS * 3);
        continue;
      }

      await reclaimStaleProcessing(pool, env.STALE_LOCK_MINUTES, log);
      const job = await claimNextJob(pool, env.lockId);
      if (!job) {
        await sleep(env.POLL_MS);
        continue;
      }
      log.info({ jobId: job.id, mediaId: job.mediaId, attempt: job.attempts }, "processing transcode job");
      await processTranscodeJob(ctx, job);
    } catch (e) {
      log.error({ err: e }, "main loop error");
      await sleep(env.POLL_MS);
    }
  }

  await pool.end();
  log.info("media-worker stopped");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
