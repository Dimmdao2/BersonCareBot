import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import { buildHlsSingleVariantArgs } from './ffmpeg/hlsArgs.js';
import { extractPosterWithFallback } from './ffmpeg/extractPosterWithFallback.js';
import {
  composeHlsVideoFilter,
  watermarkTextLine,
  type WatermarkDrawtextParams,
} from './ffmpeg/watermarkVideoFilter.js';
import { runFfmpeg } from './ffmpeg/runFfmpeg.js';
import { backoffMsAfterFailure } from './jobs/backoff.js';
import type { ClaimedJob, MediaWorkerControlPort } from './control.js';
import type { Logger } from './logger.js';
import { parseStorageTarget, type StorageTarget } from './storageTarget.js';
import {
  buildVodMasterPlaylistBody,
  parseMasterPlaylistVariantRelativeUris,
} from './hlsMasterPlaylist.js';
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
  type StorageBinding,
} from './s3.js';
import { resolveWatermarkFontPath } from './watermarkFont.js';
import { processProgramSubmissionTranscodeJob } from './processProgramSubmissionTranscode.js';
import { roundVideoDurationSecondsForStorage } from './ffmpeg/probeVideoDurationSeconds.js';
import { probeVideoDimensions } from './ffmpeg/probeVideoDimensions.js';
import {
  firstHlsSegmentName,
  sumHlsExtinfDurationSeconds,
} from './ffmpeg/hlsPlaylistDuration.js';

/**
 * 450 / 900 / 1600 / 2800 kbps ladder (owner decision 2026-09-11, `VIDEO_DELIVERY_COST_AND_METERING`
 * items 2 and 5a): ~1.75-2.0x steps between rungs. `bandwidth` is the value advertised in the HLS
 * master playlist (encode bitrate + audio + container overhead), not the raw `-b:v`.
 */
export type HlsLadderRung = {
  /** Directory name under `hls/`, and the label shown to the player. */
  label: string;
  /**
   * Бюджет ПИКСЕЛЕЙ кадра — то, чем битрейт и определяется. Не сторона.
   *
   * Владелец 11.09.2026: «короткая сторона может быть сто пикселей, а длинная тысяча, или короткая
   * пятьсот, а длинная тысяча — совершенно разные. Как вообще правильно считают битрейт?» Правильно —
   * по площади: 100x1000 это 100 тысяч пикселей, 500x1000 — полмиллиона, впятеро больше при одной и
   * той же длинной стороне.
   *
   * Ярлыки «480p/720p» однозначны только внутри одного соотношения сторон (в 16:9 «720p» это всегда
   * 1280x720 = 921 600 пикселей). В библиотеке владельца 140 роликов из 152 НЕ 16:9, поэтому ярлык
   * там не значит ничего, а площадь значит. Числа бюджетов — те же, что у привычных ступеней 16:9.
   */
  pixelBudget: number;
  videoBitrate: string;
  audioBitrate: string;
  bandwidth: number;
};

/** Ступень с фактическим размером кадра, посчитанным под пропорцию конкретного источника. */
export type PlannedHlsRung = HlsLadderRung & { width: number; height: number };

export const HLS_RUNG_LADDER: readonly HlsLadderRung[] = [
  { label: '360p', pixelBudget: 640 * 360, videoBitrate: '400k', audioBitrate: '64k', bandwidth: 450_000 },
  { label: '480p', pixelBudget: 854 * 480, videoBitrate: '800k', audioBitrate: '96k', bandwidth: 900_000 },
  { label: '576p', pixelBudget: 1024 * 576, videoBitrate: '1400k', audioBitrate: '128k', bandwidth: 1_600_000 },
  { label: '720p', pixelBudget: 1280 * 720, videoBitrate: '2500k', audioBitrate: '128k', bandwidth: 2_800_000 },
];

/** libx264 requires even dimensions; round a native source size down to the nearest even pixel. */
function evenFloor(n: number): number {
  const v = Math.floor(n);
  return v % 2 === 0 ? Math.max(2, v) : Math.max(2, v - 1);
}

/**
 * Уменьшение источника до бюджета пикселей с сохранением пропорции. Коэффициент —
 * `sqrt(бюджет / площадь источника)`, потому что площадь растёт как квадрат линейного размера.
 * Никогда больше единицы: увеличивать кадр нельзя.
 */
function frameForPixelBudget(
  sourceWidth: number,
  sourceHeight: number,
  pixelBudget: number,
): { width: number; height: number } {
  const sourceArea = sourceWidth * sourceHeight;
  const factor = Math.min(1, Math.sqrt(pixelBudget / sourceArea));
  // Только вниз: округление вверх выбивало кадр из бюджета (2560x1080 давало 1478x624 = 922 272
  // пикселя при бюджете 921 600). Эпсилон гасит двоичную погрешность, из-за которой 1080*(2/3)
  // получается 719.9999999999999 и честный 720 превратился бы в 718.
  return {
    width: evenFloor(sourceWidth * factor + 1e-6),
    height: evenFloor(sourceHeight * factor + 1e-6),
  };
}

/**
 * Ступени, которые реально кодируются для источника `sourceWidth x sourceHeight`: те, чей бюджет
 * пикселей не превышает площадь источника — то есть ступень всегда уменьшает кадр и никогда не
 * растягивает (владелец: «убрать создание видео выше исходника»).
 *
 * Сравнение по площади, а не по стороне: отбор по высоте был дефектом (для портретного ролика высота —
 * длинная сторона, ступень проходила отбор и растягивалась по ширине — 137 роликов из 152), а отбор по
 * короткой стороне врёт на сверхшироком источнике (2560x1080 дал бы 1707x720 = 1,23 млн пикселей при
 * битрейте, рассчитанном на 921 тысячу).
 *
 * Источник мельче младшей ступени всё равно даёт ровно одну рабочую ступень — в своём родном чётном
 * размере с профилем битрейта младшей ступени. Ноль ступеней невозможен.
 */
export function deriveEligibleHlsRungs(sourceWidth: number, sourceHeight: number): PlannedHlsRung[] {
  const sourceArea = sourceWidth * sourceHeight;
  const fitting = HLS_RUNG_LADDER.filter((rung) => rung.pixelBudget <= sourceArea).map((rung) => ({
    ...rung,
    ...frameForPixelBudget(sourceWidth, sourceHeight, rung.pixelBudget),
  }));
  if (fitting.length > 0) return fitting;
  const smallest = HLS_RUNG_LADDER[0]!;
  return [
    {
      ...smallest,
      label: `${evenFloor(Math.min(sourceWidth, sourceHeight))}p`,
      width: evenFloor(sourceWidth),
      height: evenFloor(sourceHeight),
    },
  ];
}

/** Short token for structured logs (no multi-line FFmpeg stderr / URLs). */
function compactTranscodeLogErrorCode(message: string): string {
  const oneLine = message.trim().replace(/\s+/g, ' ');
  const ffmpegExit = /^ffmpeg_(\d+p|poster)_exit_\d+/.exec(oneLine);
  if (ffmpegExit) return ffmpegExit[0];
  if (oneLine.startsWith('master_head_missing')) return 'master_head_missing_after_upload';
  const colon = oneLine.indexOf(':');
  if (colon > 0 && colon <= 72) return oneLine.slice(0, colon);
  return oneLine.slice(0, 80);
}

export type TranscodeContext = {
  control: MediaWorkerControlPort;
  /**
   * Хранилища, а не одно: наряд называет своё, и всё, что делается по этому наряду — скачивание
   * исходника, выкладка HLS и постера, удаление исходного MP4 — происходит внутри него.
   */
  storageFor: (target: StorageTarget) => StorageBinding;
  ffmpegBin: string;
  ffmpegTimeoutMs: number;
  maxAttempts: number;
  log: Logger;
  lockId: string;
};

/** Контекст одного наряда: хранилище уже выбрано и дальше по коду не выбирается заново. */
export type TranscodeJobContext = TranscodeContext & StorageBinding;

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
  ctx: TranscodeJobContext,
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
      await putObjectWithRetry(ctx.client, ctx.bucket, key, buf, contentTypeForKey(key), ctx.log);
    }
  }
}

/** Read `#EXTINF` total from the first variant referenced by an already-uploaded master playlist. */
async function durationFromExistingMasterPlaylist(
  ctx: TranscodeJobContext,
  masterKey: string,
  tmpRoot: string,
): Promise<number | null> {
  const masterLocal = join(tmpRoot, 'master.m3u8');
  await downloadObjectToFile(ctx.client, ctx.bucket, masterKey, masterLocal);
  const masterBody = await readFile(masterLocal, 'utf8');
  const firstVariantUri = parseMasterPlaylistVariantRelativeUris(masterBody)[0];
  if (!firstVariantUri) return null;
  const variantKey = posix.join(posix.dirname(masterKey), firstVariantUri);
  const variantLocal = join(tmpRoot, 'variant.m3u8');
  await downloadObjectToFile(ctx.client, ctx.bucket, variantKey, variantLocal);
  const variantBody = await readFile(variantLocal, 'utf8');
  return sumHlsExtinfDurationSeconds(variantBody);
}

/**
 * End-to-end transcode (FFmpeg + S3). Source MP4 at `s3_key` is deleted after a successful
 * HLS transcode (best-effort; failure to delete is logged but does not fail the job).
 */
export async function processTranscodeJob(ctx: TranscodeContext, job: ClaimedJob): Promise<void> {
  return processTranscodeJobInner(ctx, job);
}

async function processTranscodeJobInner(outer: TranscodeContext, job: ClaimedJob): Promise<void> {
  const loaded = await outer.control.load(job, outer.lockId);
  /*
   * Строки нет — работать не с чем, и в S3 этот путь не ходит: привязка нужна лишь для того,
   * чтобы отметить наряд провалившимся. Если строка ЕСТЬ, хранилище обязано быть названо, иначе
   * `parseStorageTarget` откажет и наряд упадёт громко — вместо тихой работы в чужом бакете.
   */
  const ctx: TranscodeJobContext = {
    ...outer,
    ...outer.storageFor(loaded ? parseStorageTarget(loaded.storageTarget) : 'library'),
  };
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
    const exists = await headObjectExists(ctx.client, ctx.bucket, masterKeyExisting);
    if (exists) {
      if (media.video_duration_seconds == null || media.video_duration_seconds <= 0) {
        /*
         * Backfill from the already-produced HLS playlist, never the source: by the time HLS is
         * `ready`, the source MP4 is normally already deleted (best-effort delete below), so
         * re-downloading `s3_key` here silently no-ops on almost every row — that is exactly why
         * duration was only ever recorded for 3 of 192 rows. The variant playlist always exists.
         */
        const tmpRoot = await mkdtemp(join(tmpdir(), 'mw-dur-'));
        try {
          const durationSeconds = await durationFromExistingMasterPlaylist(ctx, masterKeyExisting, tmpRoot);
          if (durationSeconds != null) {
            await ctx.control.doneHls(job, ctx.lockId, {
              durationSeconds: roundVideoDurationSecondsForStorage(durationSeconds),
            });
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
    await permanentFail(ctx, job, 'non_canonical_s3_key_layout_expected_media_mediaId_file');
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
  const posterDir = join(tmpRoot, 'poster');
  const posterLocal = join(posterDir, 'poster.jpg');

  try {
    await mkdir(hlsDir, { recursive: true });
    await mkdir(posterDir, { recursive: true });
    await downloadObjectToFile(ctx.client, ctx.bucket, media.s3_key, src);

    const sourceDimensions = await probeVideoDimensions(ctx.ffmpegBin, src, 60_000);
    if (!sourceDimensions) {
      await retryableFail(ctx, job, ctx.maxAttempts, 'ffprobe_source_dimensions_failed');
      return;
    }
    const rungs = deriveEligibleHlsRungs(sourceDimensions.width, sourceDimensions.height);

    let wmDrawtext: WatermarkDrawtextParams | null = null;
    if (watermarkEnabled && fontPath) {
      const wmTxt = join(tmpRoot, 'watermark.txt');
      await writeFile(wmTxt, watermarkTextLine(job.mediaId), 'utf8');
      wmDrawtext = {
        textFilePosix: wmTxt.replace(/\\/g, '/'),
        fontfilePosix: fontPath.replace(/\\/g, '/'),
      };
    }

    /*
     * One parameterized pass over the rung table (AGENTS.md §5 "Один общий проход"): the three
     * encode invocations used to be near-identical copies differing only in scale/bitrate/dir —
     * that is exactly the "same operation, different parameters" case the rule asks to fold into
     * one point rather than leaving as copies that can drift.
     */
    const producedRungs: Array<PlannedHlsRung & { variantPlaylistBody: string }> = [];
    for (const rung of rungs) {
      const rungDir = join(hlsDir, rung.label);
      await mkdir(rungDir, { recursive: true });
      /*
       * Ширина кадра ступени посчитана из бюджета пикселей и пропорции источника; высоту выводит сам
       * ffmpeg (`-2` = ближайшее чётное), поэтому пропорция сохраняется при любом округлении.
       * `min(..., iw)` — второй, независимый замок: даже если проба исходника соврала (например,
       * поворот записан в side data и ffprobe отдал coded-размер), кадр физически не может стать
       * больше исходника.
       */
      const scaleExpr = `scale=w='min(${rung.width}\\,iw)':h=-2`;
      const videoFilter = composeHlsVideoFilter(`${scaleExpr},format=yuv420p`, wmDrawtext);
      const run = await runFfmpeg(
        ctx.ffmpegBin,
        buildHlsSingleVariantArgs({
          inputFile: src,
          outputM3u8: 'index.m3u8',
          segmentFilename: 'seg_%03d.ts',
          videoFilter,
          videoBitrate: rung.videoBitrate,
          audioBitrate: rung.audioBitrate,
        }),
        {
          cwd: rungDir,
          timeoutMs: transcodeTimeoutMs,
          collectStderrMaxBytes: 32768,
        },
      );
      if (run.code !== 0) {
        await retryableFail(
          ctx,
          job,
          ctx.maxAttempts,
          `ffmpeg_${rung.label}_exit_${run.code}: ${run.stderrTail}`,
        );
        return;
      }
      const variantPlaylistBody = await readFile(join(rungDir, 'index.m3u8'), 'utf8');
      /*
       * Размер в манифесте — измеренный у собранного сегмента, а не наш расчёт. Плеер и подпись
       * качества, которую видит пациент, обязаны описывать существующий кадр: раньше `RESOLUTION`
       * объявлял номинальные 1280x720 там, где кадра такой высоты не производилось ни для одного
       * неширокоэкранного ролика.
       */
      const firstSegment = firstHlsSegmentName(variantPlaylistBody);
      const measured = firstSegment
        ? await probeVideoDimensions(ctx.ffmpegBin, join(rungDir, firstSegment), 60_000)
        : null;
      producedRungs.push({
        ...rung,
        width: measured?.width ?? rung.width,
        height: measured?.height ?? rung.height,
        variantPlaylistBody,
      });
    }

    const masterBody = buildVodMasterPlaylistBody(
      producedRungs.map((rung) => ({
        uri: `${rung.label}/index.m3u8`,
        bandwidth: rung.bandwidth,
        width: rung.width,
        height: rung.height,
      })),
    );
    await writeFile(join(hlsDir, 'master.m3u8'), masterBody, 'utf8');

    // Highest rung actually produced — same one the poster used before this rung was source-dependent.
    const bestProducedRung = producedRungs[producedRungs.length - 1]!;
    const posterVideoFilter = wmDrawtext
      ? composeHlsVideoFilter(`scale=${bestProducedRung.width}:-2,format=yuv420p`, wmDrawtext)
      : undefined;

    try {
      await extractPosterWithFallback({
        ffmpegBin: ctx.ffmpegBin,
        inputFile: src,
        outputJpg: posterLocal,
        videoFilter: posterVideoFilter,
        cwd: tmpRoot,
        timeoutMs: transcodeTimeoutMs,
      });
    } catch (error) {
      await retryableFail(
        ctx,
        job,
        ctx.maxAttempts,
        error instanceof Error ? error.message : String(error),
      );
      return;
    }

    await uploadDirRecursive(ctx, hlsDir, hlsBaseKeyPrefix);
    const posterBuf = await readFile(posterLocal);
    await putObjectWithRetry(
      ctx.client,
      ctx.bucket,
      posterKey,
      posterBuf,
      contentTypeForKey(posterKey),
      ctx.log,
    );

    const masterOk = await headObjectExists(ctx.client, ctx.bucket, masterKey);
    if (!masterOk) {
      await retryableFail(ctx, job, ctx.maxAttempts, 'master_head_missing_after_upload');
      return;
    }

    // Quality list mirrors exactly the rungs that were produced above — never an advertised rung
    // that wasn't built, never a produced rung left off the list.
    const qualitiesJson = JSON.stringify(
      producedRungs.map((rung) => ({
        label: rung.label,
        height: rung.height,
        path: `${rung.label}/index.m3u8`,
        bandwidth: rung.bandwidth,
      })),
    );
    // Duration from the produced playlist (sum of EXTINF), not the source: the source is deleted
    // below, but the playlist this reads survives. Any produced rung's timeline matches the source.
    const videoDurationSeconds = sumHlsExtinfDurationSeconds(producedRungs[0]!.variantPlaylistBody);
    await ctx.control.doneHls(job, ctx.lockId, {
      masterKey,
      artifactPrefix: hlsBaseKeyPrefix,
      posterKey,
      qualitiesJson,
      durationSeconds: roundVideoDurationSecondsForStorage(videoDurationSeconds),
    });
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
      await ctx.client.send(
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
