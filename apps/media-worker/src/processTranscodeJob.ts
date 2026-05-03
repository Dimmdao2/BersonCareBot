import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { tmpdir } from "node:os";
import { join, posix } from "node:path";
import type { S3Client } from "@aws-sdk/client-s3";
import type { Pool } from "pg";
import { buildHlsSingleVariantArgs, buildPosterFfmpegArgs } from "./ffmpeg/hlsArgs.js";
import { composeHlsVideoFilter, watermarkTextLine, type WatermarkDrawtextParams } from "./ffmpeg/watermarkVideoFilter.js";
import { runFfmpeg } from "./ffmpeg/runFfmpeg.js";
import { backoffMsAfterFailure } from "./jobs/backoff.js";
import type { ClaimedJob } from "./jobs/claim.js";
import type { Logger } from "./logger.js";
import { buildVodMasterPlaylistBody } from "./hlsMasterPlaylist.js";
import {
  hlsTreePrefixFromMediaRoot,
  isCanonicalMediaRootForId,
  masterPlaylistKeyFromMediaRoot,
  mediaRootFromSourceS3Key,
  posterObjectKeyFromMediaRoot,
} from "./hlsStorageLayout.js";
import {
  contentTypeForKey,
  downloadObjectToFile,
  headObjectExists,
  putObjectWithRetry,
} from "./s3.js";
import { readVideoWatermarkEnabled } from "./watermarkEnabled.js";
import { resolveWatermarkFontPath } from "./watermarkFont.js";

export type TranscodeContext = {
  pool: Pool;
  s3Client: S3Client;
  bucket: string;
  ffmpegBin: string;
  ffmpegTimeoutMs: number;
  maxAttempts: number;
  log: Logger;
};

type MediaRow = {
  id: string;
  mime_type: string;
  s3_key: string | null;
  hls_master_playlist_s3_key: string | null;
  video_processing_status: string | null;
};

async function loadMedia(pool: Pool, mediaId: string): Promise<MediaRow | null> {
  const r = await pool.query<MediaRow>(
    `SELECT id, mime_type, s3_key, hls_master_playlist_s3_key, video_processing_status
     FROM media_files WHERE id = $1::uuid`,
    [mediaId],
  );
  return r.rows[0] ?? null;
}

async function markJobDone(pool: Pool, jobId: string): Promise<void> {
  await pool.query(
    `UPDATE media_transcode_jobs
     SET status = 'done',
         locked_at = NULL,
         locked_by = NULL,
         last_error = NULL,
         updated_at = now()
     WHERE id = $1::uuid`,
    [jobId],
  );
}

async function permanentFail(
  pool: Pool,
  jobId: string,
  mediaId: string,
  message: string,
): Promise<void> {
  const err = message.slice(0, 8000);
  await pool.query(
    `UPDATE media_transcode_jobs
     SET status = 'failed',
         last_error = $2,
         locked_at = NULL,
         locked_by = NULL,
         next_attempt_at = NULL,
         updated_at = now()
     WHERE id = $1::uuid`,
    [jobId, err],
  );
  await pool.query(
    `UPDATE media_files SET video_processing_status = 'failed', video_processing_error = $2 WHERE id = $1::uuid`,
    [mediaId, err],
  );
}

async function retryableFail(
  pool: Pool,
  jobId: string,
  mediaId: string,
  attemptsAfterClaim: number,
  maxAttempts: number,
  message: string,
): Promise<void> {
  const err = message.slice(0, 8000);
  const isFinal = attemptsAfterClaim >= maxAttempts;
  if (isFinal) {
    await permanentFail(pool, jobId, mediaId, err);
    return;
  }
  const backoff = backoffMsAfterFailure(attemptsAfterClaim);
  const nextAt = new Date(Date.now() + backoff).toISOString();
  await pool.query(
    `UPDATE media_transcode_jobs
     SET status = 'pending',
         last_error = $2,
         next_attempt_at = $3::timestamptz,
         locked_at = NULL,
         locked_by = NULL,
         updated_at = now()
     WHERE id = $1::uuid`,
    [jobId, err, nextAt],
  );
  await pool.query(
    `UPDATE media_files SET video_processing_status = 'pending', video_processing_error = $2 WHERE id = $1::uuid`,
    [mediaId, err],
  );
}

async function uploadDirRecursive(
  ctx: TranscodeContext,
  localDir: string,
  s3KeyPrefix: string,
): Promise<void> {
  const entries: Dirent[] = await readdir(localDir, { withFileTypes: true });
  for (const ent of entries) {
    const localPath = join(localDir, ent.name);
    if (ent.isDirectory()) {
      await uploadDirRecursive(ctx, localPath, posix.join(s3KeyPrefix, ent.name));
    } else if (ent.isFile()) {
      const key = posix.join(s3KeyPrefix, ent.name);
      const buf = await readFile(localPath);
      await putObjectWithRetry(
        ctx.s3Client,
        ctx.bucket,
        key,
        buf,
        contentTypeForKey(key),
        ctx.log,
      );
    }
  }
}

/**
 * End-to-end transcode (FFmpeg + S3). Source MP4 at `s3_key` is never deleted. Never throws.
 */
export async function processTranscodeJob(ctx: TranscodeContext, job: ClaimedJob): Promise<void> {
  const media = await loadMedia(ctx.pool, job.mediaId);
  if (!media || !media.s3_key?.trim()) {
    await permanentFail(ctx.pool, job.id, job.mediaId, "missing_media_or_s3_key");
    return;
  }
  if (!media.mime_type.toLowerCase().startsWith("video/")) {
    await permanentFail(ctx.pool, job.id, job.mediaId, "not_video");
    return;
  }

  const masterKeyExisting = media.hls_master_playlist_s3_key?.trim();
  if (masterKeyExisting && media.video_processing_status === "ready") {
    const exists = await headObjectExists(ctx.s3Client, ctx.bucket, masterKeyExisting);
    if (exists) {
      await markJobDone(ctx.pool, job.id);
      return;
    }
  }

  const mediaRoot = mediaRootFromSourceS3Key(media.s3_key);
  if (!isCanonicalMediaRootForId(mediaRoot, job.mediaId)) {
    await permanentFail(
      ctx.pool,
      job.id,
      job.mediaId,
      "non_canonical_s3_key_layout_expected_media_mediaId_file",
    );
    return;
  }

  await ctx.pool.query(
    `UPDATE media_files SET video_processing_status = 'processing', video_processing_error = NULL WHERE id = $1::uuid`,
    [job.mediaId],
  );

  const watermarkEnabled = await readVideoWatermarkEnabled(ctx.pool);
  let fontPath: string | null = null;
  if (watermarkEnabled) {
    fontPath = resolveWatermarkFontPath(ctx.log);
    if (!fontPath) {
      await permanentFail(
        ctx.pool,
        job.id,
        job.mediaId,
        // eslint-disable-next-line no-secrets/no-secrets -- ops error token, not a secret
        "watermark_enabled_but_no_truetype_font_install_dejavu_or_set_MEDIA_WORKER_WATERMARK_FONT",
      );
      return;
    }
  }

  const transcodeTimeoutMs = watermarkEnabled
    ? Math.min(Math.round(ctx.ffmpegTimeoutMs * 1.45), ctx.ffmpegTimeoutMs + 45 * 60 * 1000)
    : ctx.ffmpegTimeoutMs;

  const hlsBaseKeyPrefix = hlsTreePrefixFromMediaRoot(mediaRoot);
  const masterKey = masterPlaylistKeyFromMediaRoot(mediaRoot);
  const posterKey = posterObjectKeyFromMediaRoot(mediaRoot);

  const tmpRoot = await mkdtemp(join(tmpdir(), "mw-hls-"));
  const src = join(tmpRoot, "source.bin");
  const hlsDir = join(tmpRoot, "hls");
  const dir720 = join(hlsDir, "720p");
  const dir480 = join(hlsDir, "480p");
  const posterDir = join(tmpRoot, "poster");
  const posterLocal = join(posterDir, "poster.jpg");

  try {
    await mkdir(dir720, { recursive: true });
    await mkdir(dir480, { recursive: true });
    await mkdir(posterDir, { recursive: true });
    await downloadObjectToFile(ctx.s3Client, ctx.bucket, media.s3_key, src);

    let wmDrawtext: WatermarkDrawtextParams | null = null;
    if (watermarkEnabled && fontPath) {
      const wmTxt = join(tmpRoot, "watermark.txt");
      await writeFile(wmTxt, watermarkTextLine(job.mediaId), "utf8");
      wmDrawtext = {
        textFilePosix: wmTxt.replace(/\\/g, "/"),
        fontfilePosix: fontPath.replace(/\\/g, "/"),
      };
    }

    const vf720 = composeHlsVideoFilter("scale=1280:-2,format=yuv420p", wmDrawtext);
    const vf480 = composeHlsVideoFilter("scale=854:-2,format=yuv420p", wmDrawtext);

    const run720 = await runFfmpeg(
      ctx.ffmpegBin,
      buildHlsSingleVariantArgs({
        inputFile: src,
        outputM3u8: "index.m3u8",
        segmentFilename: "seg_%03d.ts",
        videoFilter: vf720,
        videoBitrate: "2500k",
        audioBitrate: "128k",
      }),
      {
        cwd: dir720,
        timeoutMs: transcodeTimeoutMs,
        collectStderrMaxBytes: 32768,
      },
    );
    if (run720.code !== 0) {
      await retryableFail(
        ctx.pool,
        job.id,
        job.mediaId,
        job.attempts,
        ctx.maxAttempts,
        `ffmpeg_720p_exit_${run720.code}: ${run720.stderrTail}`,
      );
      return;
    }

    const run480 = await runFfmpeg(
      ctx.ffmpegBin,
      buildHlsSingleVariantArgs({
        inputFile: src,
        outputM3u8: "index.m3u8",
        segmentFilename: "seg_%03d.ts",
        videoFilter: vf480,
        videoBitrate: "800k",
        audioBitrate: "96k",
      }),
      {
        cwd: dir480,
        timeoutMs: transcodeTimeoutMs,
        collectStderrMaxBytes: 32768,
      },
    );
    if (run480.code !== 0) {
      await retryableFail(
        ctx.pool,
        job.id,
        job.mediaId,
        job.attempts,
        ctx.maxAttempts,
        `ffmpeg_480p_exit_${run480.code}: ${run480.stderrTail}`,
      );
      return;
    }

    const masterBody = buildVodMasterPlaylistBody([
      { uri: "720p/index.m3u8", bandwidth: 2_800_000, width: 1280, height: 720 },
      { uri: "480p/index.m3u8", bandwidth: 900_000, width: 854, height: 480 },
    ]);
    await writeFile(join(hlsDir, "master.m3u8"), masterBody, "utf8");

    const posterArgs = buildPosterFfmpegArgs(
      src,
      posterLocal,
      wmDrawtext ? vf720 : undefined,
    );
    const runPoster = await runFfmpeg(ctx.ffmpegBin, posterArgs, {
      cwd: tmpRoot,
      timeoutMs: transcodeTimeoutMs,
      collectStderrMaxBytes: 16384,
    });
    if (runPoster.code !== 0) {
      await retryableFail(
        ctx.pool,
        job.id,
        job.mediaId,
        job.attempts,
        ctx.maxAttempts,
        `ffmpeg_poster_exit_${runPoster.code}: ${runPoster.stderrTail}`,
      );
      return;
    }

    await uploadDirRecursive(ctx, hlsDir, hlsBaseKeyPrefix);
    const posterBuf = await readFile(posterLocal);
    await putObjectWithRetry(
      ctx.s3Client,
      ctx.bucket,
      posterKey,
      posterBuf,
      contentTypeForKey(posterKey),
      ctx.log,
    );

    const masterOk = await headObjectExists(ctx.s3Client, ctx.bucket, masterKey);
    if (!masterOk) {
      await retryableFail(
        ctx.pool,
        job.id,
        job.mediaId,
        job.attempts,
        ctx.maxAttempts,
        "master_head_missing_after_upload",
      );
      return;
    }

    const qualitiesJson = JSON.stringify([
      { label: "720p", height: 720, path: "720p/index.m3u8", bandwidth: 2_800_000 },
      { label: "480p", height: 480, path: "480p/index.m3u8", bandwidth: 900_000 },
    ]);
    await ctx.pool.query(
      `UPDATE media_files SET
        video_processing_status = 'ready',
        video_processing_error = NULL,
        hls_master_playlist_s3_key = $1,
        hls_artifact_prefix = $2,
        poster_s3_key = $3,
        available_qualities_json = $4::jsonb
      WHERE id = $5::uuid`,
      [masterKey, hlsBaseKeyPrefix, posterKey, qualitiesJson, job.mediaId],
    );
    await markJobDone(ctx.pool, job.id);
    ctx.log.info(
      { jobId: job.id, mediaId: job.mediaId, masterKey, watermark: Boolean(watermarkEnabled) },
      "transcode completed",
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    ctx.log.error({ err: e, jobId: job.id }, "transcode unexpected error");
    await retryableFail(ctx.pool, job.id, job.mediaId, job.attempts, ctx.maxAttempts, msg);
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
}
