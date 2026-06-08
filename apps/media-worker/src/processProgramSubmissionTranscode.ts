import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, posix } from "node:path";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import type { ClaimedJob } from "./jobs/claim.js";
import type { TranscodeContext } from "./processTranscodeJob.js";
import { buildPosterFfmpegArgs } from "./ffmpeg/hlsArgs.js";
import { runFfmpeg } from "./ffmpeg/runFfmpeg.js";
import {
  isCanonicalMediaRootForId,
  mediaRootFromSourceS3Key,
  posterObjectKeyFromMediaRoot,
} from "./hlsStorageLayout.js";
import { runMediaWorkerPgText } from "./runMediaWorkerSql.js";
import { probeVideoDurationSeconds } from "./ffmpeg/probeVideoDurationSeconds.js";
import { downloadObjectToFile, headObjectExists, putObjectWithRetry, contentTypeForKey } from "./s3.js";

function submission480pKeyFromMediaRoot(mediaRoot: string): string {
  return posix.join(mediaRoot.replace(/\/+$/, ""), "480p.mp4");
}

/**
 * Program-item submission: single 480p progressive MP4, delete original source after success.
 */
export async function processProgramSubmissionTranscodeJob(
  ctx: TranscodeContext,
  job: ClaimedJob,
  media: { id: string; mime_type: string; s3_key: string },
): Promise<void> {
  const sourceKey = media.s3_key.trim();
  const mediaRoot = mediaRootFromSourceS3Key(sourceKey);
  if (!isCanonicalMediaRootForId(mediaRoot, job.mediaId)) {
    await runMediaWorkerPgText(
      ctx.pool,
      `UPDATE public.media_transcode_jobs SET status = 'failed', last_error = $2, finished_at = now(), updated_at = now() WHERE id = $1::uuid`,
      [job.id, "non_canonical_s3_key_layout"],
    );
    await runMediaWorkerPgText(
      ctx.pool,
      `UPDATE public.media_files SET video_processing_status = 'failed', video_processing_error = $2 WHERE id = $1::uuid`,
      [job.mediaId, "non_canonical_s3_key_layout"],
    );
    return;
  }

  const outputKey = submission480pKeyFromMediaRoot(mediaRoot);
  const posterKey = posterObjectKeyFromMediaRoot(mediaRoot);
  const workDir = await mkdtemp(join(tmpdir(), "mw-sub-"));
  const src = join(workDir, "source.bin");
  const outMp4 = join(workDir, "480p.mp4");
  const posterDir = join(workDir, "poster");
  const posterLocal = join(posterDir, "poster.jpg");

  try {
    await runMediaWorkerPgText(
      ctx.pool,
      `UPDATE public.media_files SET video_processing_status = 'processing', video_processing_error = NULL WHERE id = $1::uuid`,
      [job.mediaId],
    );

    await downloadObjectToFile(ctx.s3Client, ctx.bucket, sourceKey, src);

    const ffmpegArgs = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      src,
      "-vf",
      "scale=-2:480",
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "23",
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
      outMp4,
    ];
    const run = await runFfmpeg(ctx.ffmpegBin, ffmpegArgs, {
      cwd: workDir,
      timeoutMs: ctx.ffmpegTimeoutMs,
      collectStderrMaxBytes: 16384,
    });
    if (run.code !== 0) {
      throw new Error(`ffmpeg_submission_480p_exit_${run.code}: ${run.stderrTail}`);
    }

    const mp4Buf = await readFile(outMp4);
    await putObjectWithRetry(ctx.s3Client, ctx.bucket, outputKey, mp4Buf, "video/mp4", ctx.log);
    const videoDurationSeconds = await probeVideoDurationSeconds(ctx.ffmpegBin, outMp4, 60_000);

    await mkdir(posterDir, { recursive: true });
    const posterArgs = buildPosterFfmpegArgs(src, posterLocal);
    const runPoster = await runFfmpeg(ctx.ffmpegBin, posterArgs, {
      cwd: workDir,
      timeoutMs: ctx.ffmpegTimeoutMs,
      collectStderrMaxBytes: 16384,
    });
    if (runPoster.code !== 0) {
      throw new Error(`ffmpeg_poster_exit_${runPoster.code}: ${runPoster.stderrTail}`);
    }
    const posterBuf = await readFile(posterLocal);
    await putObjectWithRetry(
      ctx.s3Client,
      ctx.bucket,
      posterKey,
      posterBuf,
      contentTypeForKey(posterKey),
      ctx.log,
    );

    const headOk = await headObjectExists(ctx.s3Client, ctx.bucket, outputKey);
    if (!headOk) {
      // eslint-disable-next-line no-secrets/no-secrets -- ops error token, not a secret
      throw new Error("submission_480p_head_missing_after_upload");
    }

    if (sourceKey !== outputKey) {
      try {
        await ctx.s3Client.send(
          new DeleteObjectCommand({
            Bucket: ctx.bucket,
            Key: sourceKey,
          }),
        );
      } catch (e) {
        ctx.log.warn({ err: e, mediaId: job.mediaId, sourceKey }, "submission_source_delete_failed");
      }
    }

    const qualitiesJson = JSON.stringify([{ label: "480p", height: 480, path: "480p.mp4", bandwidth: 900_000 }]);
    await runMediaWorkerPgText(
      ctx.pool,
      `UPDATE public.media_files SET
        s3_key = $1,
        mime_type = 'video/mp4',
        video_processing_status = 'ready',
        video_processing_error = NULL,
        video_delivery_override = 'mp4',
        available_qualities_json = $2::jsonb,
        hls_master_playlist_s3_key = NULL,
        hls_artifact_prefix = NULL,
        poster_s3_key = $4,
        video_duration_seconds = COALESCE($5, video_duration_seconds)
      WHERE id = $3::uuid`,
      [outputKey, qualitiesJson, job.mediaId, posterKey, videoDurationSeconds],
    );

    await runMediaWorkerPgText(
      ctx.pool,
      `UPDATE public.media_transcode_jobs
       SET status = 'done', locked_at = NULL, locked_by = NULL, last_error = NULL, finished_at = now(), updated_at = now()
       WHERE id = $1::uuid`,
      [job.id],
    );
    ctx.log.info(
      { jobId: job.id, mediaId: job.mediaId, outcome: "done", mode: "program_submission_480p" },
      "transcode completed",
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await runMediaWorkerPgText(
      ctx.pool,
      `UPDATE public.media_transcode_jobs SET status = 'failed', last_error = $2, finished_at = now(), updated_at = now() WHERE id = $1::uuid`,
      [job.id, msg.slice(0, 8000)],
    );
    await runMediaWorkerPgText(
      ctx.pool,
      `UPDATE public.media_files SET video_processing_status = 'failed', video_processing_error = $2 WHERE id = $1::uuid`,
      [job.mediaId, msg.slice(0, 8000)],
    );
    ctx.log.warn({ jobId: job.id, mediaId: job.mediaId, err: msg.slice(0, 200) }, "program_submission_transcode_failed");
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {
      /* ignore */
    });
  }
}
