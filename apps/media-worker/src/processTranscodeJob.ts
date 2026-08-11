import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import type { S3Client } from '@aws-sdk/client-s3';
import { buildHlsSingleVariantArgs, buildPosterFfmpegArgs } from './ffmpeg/hlsArgs.js';
import {
  composeHlsVideoFilter,
  watermarkTextLine,
  type WatermarkDrawtextParams,
} from './ffmpeg/watermarkVideoFilter.js';
import { runFfmpeg } from './ffmpeg/runFfmpeg.js';
import { backoffMsAfterFailure } from './jobs/backoff.js';
import type { ClaimedJob, MediaWorkerControlPort } from './control.js';
import type { Logger } from './logger.js';
import { buildVodMasterPlaylistBody } from './hlsMasterPlaylist.js';
import {
  hlsTreePrefixFromMediaRoot,
  isCanonicalMediaRootForId,
  masterPlaylistKeyFromMediaRoot,
  mediaRootFromSourceS3Key,
  posterObjectKeyFromMediaRoot,
} from './hlsStorageLayout.js';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import {
  contentTypeForKey,
  downloadObjectToFile,
  headObjectExists,
  putObjectWithRetry,
} from './s3.js';
import { resolveWatermarkFontPath } from './watermarkFont.js';
import { processProgramSubmissionTranscodeJob } from './processProgramSubmissionTranscode.js';
import { probeVideoDurationSeconds } from './ffmpeg/probeVideoDurationSeconds.js';

/** Short token for structured logs (no multi-line FFmpeg stderr / URLs). */
function compactTranscodeLogErrorCode(message: string): string {
  const oneLine = message.trim().replace(/\s+/g, ' ');
  const ffmpegExit = /^ffmpeg_(720p|480p|360p|poster)_exit_\d+/.exec(oneLine);
  if (ffmpegExit) return ffmpegExit[0];
  if (oneLine.startsWith('master_head_missing')) return 'master_head_missing_after_upload';
  const colon = oneLine.indexOf(':');
  if (colon > 0 && colon <= 72) return oneLine.slice(0, colon);
  return oneLine.slice(0, 80);
}

export type TranscodeContext = {
  control: MediaWorkerControlPort;
  s3Client: S3Client;
  bucket: string;
  ffmpegBin: string;
  ffmpegTimeoutMs: number;
  maxAttempts: number;
  log: Logger;
  lockId: string;
};

type MediaRow = {
  id: string;
  mime_type: string;
  s3_key: string | null;
  hls_master_playlist_s3_key: string | null;
  video_processing_status: string | null;
  video_duration_seconds: number | null;
  usage_purpose: string | null;
};

async function permanentFail(
  ctx: TranscodeContext,
  job: ClaimedJob,
  message: string,
): Promise<void> {
  const err = message.slice(0, 8000);
  await ctx.control.failed(job, ctx.lockId, err);
  ctx.log.warn(
    {
      jobId: job.id,
      mediaId: job.mediaId,
      outcome: 'failed_permanent',
      errorCode: compactTranscodeLogErrorCode(err),
    },
    'transcode_job_terminal',
  );
}

async function retryableFail(
  ctx: TranscodeContext,
  job: ClaimedJob,
  maxAttempts: number,
  message: string,
): Promise<void> {
  const err = message.slice(0, 8000);
  const isFinal = job.attempts >= maxAttempts;
  if (isFinal) {
    await permanentFail(ctx, job, err);
    return;
  }
  const backoff = backoffMsAfterFailure(job.attempts);
  const nextAt = new Date(Date.now() + backoff).toISOString();
  await ctx.control.retry(job, ctx.lockId, nextAt, err);
  ctx.log.info(
    {
      jobId: job.id,
      mediaId: job.mediaId,
      outcome: 'retry_pending',
      attemptsAfterClaim: job.attempts,
      errorCode: compactTranscodeLogErrorCode(err),
    },
    'transcode_job_retry',
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
      await putObjectWithRetry(ctx.s3Client, ctx.bucket, key, buf, contentTypeForKey(key), ctx.log);
    }
  }
}

/**
 * End-to-end transcode (FFmpeg + S3). Source MP4 at `s3_key` is deleted after a successful
 * HLS transcode (best-effort; failure to delete is logged but does not fail the job).
 */
export async function processTranscodeJob(ctx: TranscodeContext, job: ClaimedJob): Promise<void> {
  return processTranscodeJobInner(ctx, job);
}

async function processTranscodeJobInner(ctx: TranscodeContext, job: ClaimedJob): Promise<void> {
  const loaded = await ctx.control.load(job, ctx.lockId);
  const media = loaded && {
    id: loaded.id,
    mime_type: loaded.mimeType,
    s3_key: loaded.s3Key,
    hls_master_playlist_s3_key: loaded.hlsMasterPlaylistS3Key,
    video_processing_status: loaded.videoProcessingStatus,
    video_duration_seconds: loaded.videoDurationSeconds,
    usage_purpose: loaded.usagePurpose,
  };
  if (!media || !media.s3_key?.trim()) {
    await permanentFail(ctx, job, 'missing_media_or_s3_key');
    return;
  }
  if (!media.mime_type.toLowerCase().startsWith('video/')) {
    await permanentFail(ctx, job, 'not_video');
    return;
  }

  if (media.usage_purpose === 'program_item_submission' && media.s3_key?.trim()) {
    await processProgramSubmissionTranscodeJob(ctx, job, {
      id: media.id,
      mime_type: media.mime_type,
      s3_key: media.s3_key,
    });
    return;
  }

  const masterKeyExisting = media.hls_master_playlist_s3_key?.trim();
  if (masterKeyExisting && media.video_processing_status === 'ready') {
    const exists = await headObjectExists(ctx.s3Client, ctx.bucket, masterKeyExisting);
    if (exists) {
      if (
        (media.video_duration_seconds == null || media.video_duration_seconds <= 0) &&
        media.s3_key?.trim()
      ) {
        const tmpRoot = await mkdtemp(join(tmpdir(), 'mw-dur-'));
        const src = join(tmpRoot, 'source.bin');
        try {
          await downloadObjectToFile(ctx.s3Client, ctx.bucket, media.s3_key.trim(), src);
          const durationSeconds = await probeVideoDurationSeconds(ctx.ffmpegBin, src, Math.min(ctx.ffmpegTimeoutMs, 120_000));
          if (durationSeconds != null) {
            await ctx.control.doneHls(job, ctx.lockId, { durationSeconds });
            return;
          }
        } catch (e) {
          ctx.log.warn({ err: e, mediaId: job.mediaId }, 'video_duration_backfill_failed');
        } finally {
          await rm(tmpRoot, { recursive: true, force: true });
        }
      }
      await ctx.control.doneHls(job, ctx.lockId, {});
      ctx.log.info(
        { jobId: job.id, mediaId: job.mediaId, outcome: 'done', skip: 'already_ready' },
        'transcode completed',
      );
      return;
    }
  }

  const mediaRoot = mediaRootFromSourceS3Key(media.s3_key);
  if (!isCanonicalMediaRootForId(mediaRoot, job.mediaId)) {
    await permanentFail(
      ctx,
      job,
      'non_canonical_s3_key_layout_expected_media_mediaId_file',
    );
    return;
  }

  await ctx.control.processing(job, ctx.lockId);

  const watermarkEnabled = await ctx.control.watermarkEnabled();
  let fontPath: string | null = null;
  if (watermarkEnabled) {
    fontPath = resolveWatermarkFontPath(ctx.log);
    if (!fontPath) {
      await permanentFail(
        ctx,
        job,
        'watermark_enabled_but_no_truetype_font_install_dejavu_or_set_MEDIA_WORKER_WATERMARK_FONT',
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

  const tmpRoot = await mkdtemp(join(tmpdir(), 'mw-hls-'));
  const src = join(tmpRoot, 'source.bin');
  const hlsDir = join(tmpRoot, 'hls');
  const dir720 = join(hlsDir, '720p');
  const dir480 = join(hlsDir, '480p');
  const dir360 = join(hlsDir, '360p');
  const posterDir = join(tmpRoot, 'poster');
  const posterLocal = join(posterDir, 'poster.jpg');

  try {
    await mkdir(dir720, { recursive: true });
    await mkdir(dir480, { recursive: true });
    await mkdir(dir360, { recursive: true });
    await mkdir(posterDir, { recursive: true });
    await downloadObjectToFile(ctx.s3Client, ctx.bucket, media.s3_key, src);
    const videoDurationSeconds = await probeVideoDurationSeconds(ctx.ffmpegBin, src, 60_000);

    let wmDrawtext: WatermarkDrawtextParams | null = null;
    if (watermarkEnabled && fontPath) {
      const wmTxt = join(tmpRoot, 'watermark.txt');
      await writeFile(wmTxt, watermarkTextLine(job.mediaId), 'utf8');
      wmDrawtext = {
        textFilePosix: wmTxt.replace(/\\/g, '/'),
        fontfilePosix: fontPath.replace(/\\/g, '/'),
      };
    }

    const vf720 = composeHlsVideoFilter('scale=1280:-2,format=yuv420p', wmDrawtext);
    const vf480 = composeHlsVideoFilter('scale=854:-2,format=yuv420p', wmDrawtext);
    const vf360 = composeHlsVideoFilter('scale=640:-2,format=yuv420p', wmDrawtext);

    const run720 = await runFfmpeg(
      ctx.ffmpegBin,
      buildHlsSingleVariantArgs({
        inputFile: src,
        outputM3u8: 'index.m3u8',
        segmentFilename: 'seg_%03d.ts',
        videoFilter: vf720,
        videoBitrate: '2500k',
        audioBitrate: '128k',
      }),
      {
        cwd: dir720,
        timeoutMs: transcodeTimeoutMs,
        collectStderrMaxBytes: 32768,
      },
    );
    if (run720.code !== 0) {
      await retryableFail(
        ctx,
        job,
        ctx.maxAttempts,
        `ffmpeg_720p_exit_${run720.code}: ${run720.stderrTail}`,
      );
      return;
    }

    const run480 = await runFfmpeg(
      ctx.ffmpegBin,
      buildHlsSingleVariantArgs({
        inputFile: src,
        outputM3u8: 'index.m3u8',
        segmentFilename: 'seg_%03d.ts',
        videoFilter: vf480,
        videoBitrate: '800k',
        audioBitrate: '96k',
      }),
      {
        cwd: dir480,
        timeoutMs: transcodeTimeoutMs,
        collectStderrMaxBytes: 32768,
      },
    );
    if (run480.code !== 0) {
      await retryableFail(
        ctx,
        job,
        ctx.maxAttempts,
        `ffmpeg_480p_exit_${run480.code}: ${run480.stderrTail}`,
      );
      return;
    }

    const run360 = await runFfmpeg(
      ctx.ffmpegBin,
      buildHlsSingleVariantArgs({
        inputFile: src,
        outputM3u8: 'index.m3u8',
        segmentFilename: 'seg_%03d.ts',
        videoFilter: vf360,
        videoBitrate: '400k',
        audioBitrate: '64k',
      }),
      {
        cwd: dir360,
        timeoutMs: transcodeTimeoutMs,
        collectStderrMaxBytes: 32768,
      },
    );
    if (run360.code !== 0) {
      await retryableFail(
        ctx,
        job,
        ctx.maxAttempts,
        `ffmpeg_360p_exit_${run360.code}: ${run360.stderrTail}`,
      );
      return;
    }

    const masterBody = buildVodMasterPlaylistBody([
      { uri: '720p/index.m3u8', bandwidth: 2_800_000, width: 1280, height: 720 },
      { uri: '480p/index.m3u8', bandwidth: 900_000, width: 854, height: 480 },
      { uri: '360p/index.m3u8', bandwidth: 450_000, width: 640, height: 360 },
    ]);
    await writeFile(join(hlsDir, 'master.m3u8'), masterBody, 'utf8');

    const posterArgs = buildPosterFfmpegArgs(src, posterLocal, wmDrawtext ? vf720 : undefined);
    const runPoster = await runFfmpeg(ctx.ffmpegBin, posterArgs, {
      cwd: tmpRoot,
      timeoutMs: transcodeTimeoutMs,
      collectStderrMaxBytes: 16384,
    });
    if (runPoster.code !== 0) {
      await retryableFail(
        ctx,
        job,
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
        ctx,
        job,
        ctx.maxAttempts,
        'master_head_missing_after_upload',
      );
      return;
    }

    const qualitiesJson = JSON.stringify([
      { label: '720p', height: 720, path: '720p/index.m3u8', bandwidth: 2_800_000 },
      { label: '480p', height: 480, path: '480p/index.m3u8', bandwidth: 900_000 },
      { label: '360p', height: 360, path: '360p/index.m3u8', bandwidth: 450_000 },
    ]);
    await ctx.control.doneHls(job, ctx.lockId, { masterKey, artifactPrefix: hlsBaseKeyPrefix, posterKey, qualitiesJson, durationSeconds: videoDurationSeconds });
    ctx.log.info(
      {
        jobId: job.id,
        mediaId: job.mediaId,
        outcome: 'done',
        masterKey,
        watermark: Boolean(watermarkEnabled),
      },
      'transcode completed',
    );

    // Best-effort: delete the original uploaded source file now that HLS renditions are live.
    const sourceKey = media.s3_key;
    try {
      await ctx.s3Client.send(
        new DeleteObjectCommand({
          Bucket: ctx.bucket,
          Key: sourceKey,
        }),
      );
      ctx.log.info({ mediaId: job.mediaId, sourceKey }, 'source_deleted_after_transcode');
    } catch (e) {
      ctx.log.warn({ err: e, mediaId: job.mediaId, sourceKey }, 'source_delete_failed_nonfatal');
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    ctx.log.error({ err: e, jobId: job.id }, 'transcode unexpected error');
    await retryableFail(ctx, job, ctx.maxAttempts, msg);
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
}
