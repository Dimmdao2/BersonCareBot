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
import { probeVideoDimensions, type VideoSourceProbe } from './ffmpeg/probeVideoDimensions.js';
import {
  firstHlsSegmentName,
  hlsMapUriFromVariantPlaylist,
  sumHlsExtinfDurationSeconds,
} from './ffmpeg/hlsPlaylistDuration.js';

/** Filename of the fMP4 init segment (`ftyp`+`moov`), relative to its variant directory. */
const HLS_FMP4_INIT_SEGMENT_FILENAME = 'init.mp4';

/**
 * 730 / 800 / 1400 / 2500 kbps ceilings (advertised 850 / 900 / 1600 / 2800) (owner decision 2026-09-11, `VIDEO_DELIVERY_COST_AND_METERING`
 * items 2 and 5a): ~1.2-1.75x steps between rungs. `bandwidth` is the value advertised in the HLS
 * master playlist. `videoBitrate` is now a CEILING (`-maxrate`, capped further by the source bitrate
 * when known — §«потолок ступени никогда не выше битрейта исходника»), not a `-b:v` ABR target; CRF
 * (see `hlsArgs.ts`) decides the actual encode rate below that ceiling.
 *
 * The bottom rung's `videoBitrate`/`bandwidth` were raised from 400k/450k to the published Apple HLS
 * Authoring Specification value for 640×360 (730 kbps): under plain `-b:v` ABR a lower target saved
 * bytes on every simple clip regardless of content, but under CRF+ceiling the ceiling only matters for
 * clips complex enough to hit it — so there is no byte cost to raising it back to the published number,
 * and clips that DO hit it (busy scene, poor light) get a materially more legible picture. Owner
 * 11.09.2026: "верхняя ступень остаётся 720p — выше нам не нужно" (the other three rungs are
 * untouched: their existing `bandwidth` already exceeds their `videoBitrate` ceiling by the same
 * audio+overhead margin it always did, so they stay honest without a change; the bottom rung's
 * advertised `bandwidth` had to move with its ceiling, see the comment on the rung itself).
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
  // BANDWIDTH — ПИКОВАЯ полоса варианта (видео + звук + контейнер), поэтому 850k, а не 730k: потолок
  // видео 730k плюс 64k звука уже 794k, и плеер, которому объявили 730k, выбрал бы ступень, которую не
  // может выдержать. Остальные три ступени тот же запас несли и раньше (800+96→900, 1400+128→1600,
  // 2500+128→2800) — их не трогаем. Потолок КОДИРОВАНИЯ нижней ступени ровно 730k, как решил владелец.
  { label: '360p', pixelBudget: 640 * 360, videoBitrate: '730k', audioBitrate: '64k', bandwidth: 850_000 },
  { label: '480p', pixelBudget: 854 * 480, videoBitrate: '800k', audioBitrate: '96k', bandwidth: 900_000 },
  { label: '576p', pixelBudget: 1024 * 576, videoBitrate: '1400k', audioBitrate: '128k', bandwidth: 1_600_000 },
  { label: '720p', pixelBudget: 1280 * 720, videoBitrate: '2500k', audioBitrate: '128k', bandwidth: 2_800_000 },
];

/** Parses an ffmpeg bitrate token (`400k`, `2.5M`, `128000`) into bits/sec. */
export function parseFfmpegBitrateTokenBps(token: string): number {
  const m = /^(\d+(?:\.\d+)?)([kKmM])?$/.exec(token.trim());
  if (!m) throw new Error(`unparseable ffmpeg bitrate token: ${token}`);
  const value = Number.parseFloat(m[1]!);
  const suffix = m[2]?.toLowerCase();
  const multiplier = suffix === 'k' ? 1_000 : suffix === 'm' ? 1_000_000 : 1;
  return Math.round(value * multiplier);
}

/**
 * Требование 3 (`VIDEO_DELIVERY_COST_AND_METERING`, «Не кодировать ступень с битрейтом выше битрейта
 * исходника»): перекодировать 800 кбит/с исходник в ступень с потолком 2500 кбит/с — это больший файл
 * без единого дополнительного бита информации. Потолок ступени — её плановый `-maxrate`, урезанный до
 * битрейта исходника, когда тот измерен и ниже. Источник, у которого битрейт измерить не удалось,
 * ведёт себя как раньше — потолок не урезаем, а не выдумываем число.
 */
export function rungBitrateCeilingBps(
  rungVideoBitrate: string,
  sourceBitrateBps: number | null,
): number {
  const planned = parseFfmpegBitrateTokenBps(rungVideoBitrate);
  if (sourceBitrateBps == null || sourceBitrateBps <= 0) return planned;
  return Math.min(planned, sourceBitrateBps);
}

/**
 * Потолок ВИДЕО берётся от видеопотока, а не от контейнера. Контейнер несёт ещё звук и накладные:
 * по замеру живой библиотеки владельца 11.09.2026 (151 ролик) он больше видеопотока в среднем на
 * 110 кбит/с, а на слабом источнике это разница в разы — аудит `vid-encoding-audit-01` показал
 * источник, где контейнер 70 675 бит/с при видеопотоке 31 864. Контейнер остаётся резервом: он
 * всё-таки ближе к правде, чем плановый потолок ступени.
 */
export function rungVideoCeilingFromProbeBps(
  rungVideoBitrate: string,
  probe: { videoBitrateBps: number | null; bitrateBps: number | null },
): number {
  const source = probe.videoBitrateBps ?? probe.bitrateBps;
  return rungBitrateCeilingBps(rungVideoBitrate, source);
}

/**
 * Звук НИКОГДА не переписывается вверх. План ступени (64/96/128k) — тоже потолок, а не цель: в
 * библиотеке владельца медиана звука 105 кбит/с и 139 роликов из 148 тише 128k, то есть на двух
 * верхних ступенях мы систематически раздували дорожку и съедали часть экономии по видео.
 * Источник без звука или без сообщённого битрейта ведёт себя как раньше — план не трогаем.
 */
export function rungAudioBitrateBps(
  rungAudioBitrate: string,
  sourceAudioBitrateBps: number | null,
): number {
  const planned = parseFfmpegBitrateTokenBps(rungAudioBitrate);
  if (sourceAudioBitrateBps == null || sourceAudioBitrateBps <= 0) return planned;
  return Math.min(planned, sourceAudioBitrateBps);
}

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
 * Порог, выше которого лестница фиксированных бюджетов режет слишком много пикселей источника
 * (владелец 11.09.2026, `VIDEO_DELIVERY_COST_AND_METERING` — «верхняя ступень = кадр исходника»):
 * замер живой библиотеки (151 ролик) нашёл 58 из 89 роликов не выше потолка 720p, теряющих больше
 * 10% пикселей на самой большой влезающей ступени просто потому, что ступеней четыре и мы берём
 * самую большую влезающую. 1,05, не 1,00 — иначе на границе бюджета появляется ступень-двойник тех
 * же почти размеров, что и штатная.
 */
const SOURCE_FRAME_TOP_RUNG_THRESHOLD = 1.05;

/** Потолок владельца по площади — верх лестницы, 1280×720 = 921 600 пикселей. Не двигаем. */
const SOURCE_FRAME_TOP_RUNG_PIXEL_CEILING = HLS_RUNG_LADDER[HLS_RUNG_LADDER.length - 1]!.pixelBudget;

/**
 * Ступень «кадр исходника как есть» между `lower` (самая большая влезающая ступень лестницы) и
 * `upper` (следующая ступень лестницы, в бюджет которой источник не укладывается). Потолок
 * битрейта, звук и `bandwidth` — линейная интерполяция по площади между потолками этих двух
 * соседей, а не выдуманное число: `t=0` в точности воспроизводит `lower`, `t=1` — `upper`, поэтому
 * инвариант «bandwidth в диапазоне [потолок+звук, 1.15×(потолок+звук)]», который держит каждая
 * ступень статической лестницы, у интерполированной по построению — выпуклая комбинация двух троек,
 * каждая из которых инвариант уже держит.
 */
function deriveSourceFrameTopRung(
  sourceWidth: number,
  sourceHeight: number,
  lower: HlsLadderRung,
  upper: HlsLadderRung,
): PlannedHlsRung {
  const sourceArea = sourceWidth * sourceHeight;
  const t = (sourceArea - lower.pixelBudget) / (upper.pixelBudget - lower.pixelBudget);
  const lerp = (a: number, b: number): number => Math.round(a + t * (b - a));
  return {
    label: `${evenFloor(Math.min(sourceWidth, sourceHeight))}p`,
    pixelBudget: sourceArea,
    videoBitrate: String(
      lerp(parseFfmpegBitrateTokenBps(lower.videoBitrate), parseFfmpegBitrateTokenBps(upper.videoBitrate)),
    ),
    audioBitrate: String(
      lerp(parseFfmpegBitrateTokenBps(lower.audioBitrate), parseFfmpegBitrateTokenBps(upper.audioBitrate)),
    ),
    bandwidth: lerp(lower.bandwidth, upper.bandwidth),
    width: evenFloor(sourceWidth),
    height: evenFloor(sourceHeight),
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
 *
 * Верхняя ступень несёт кадр исходника, а не самую большую влезающую фиксированную ступень, когда та
 * отрезала бы больше 10% пикселей источника (`SOURCE_FRAME_TOP_RUNG_THRESHOLD`) — см.
 * `deriveSourceFrameTopRung`. Источник ≥ потолка 720p по площади не получает такой ступени: верх
 * остаётся ровно 720p, как раньше (владелец: «выше нам не нужно»); в этом случае у самой большой
 * влезающей ступени лестницы (720p) просто нет следующего соседа для интерполяции.
 */
export function deriveEligibleHlsRungs(sourceWidth: number, sourceHeight: number): PlannedHlsRung[] {
  const sourceArea = sourceWidth * sourceHeight;
  const fitting = HLS_RUNG_LADDER.filter((rung) => rung.pixelBudget <= sourceArea).map((rung) => ({
    ...rung,
    ...frameForPixelBudget(sourceWidth, sourceHeight, rung.pixelBudget),
  }));
  if (fitting.length > 0) {
    const largest = fitting[fitting.length - 1]!;
    // `largest` — копия (`{...rung, ...frame}`), не тот же объект: ищем соседа лестницы по бюджету,
    // не по ссылке.
    const upperLadderRung = HLS_RUNG_LADDER.find((rung) => rung.pixelBudget > largest.pixelBudget);
    if (
      upperLadderRung &&
      sourceArea > largest.pixelBudget * SOURCE_FRAME_TOP_RUNG_THRESHOLD &&
      // Страховка, а не рабочее условие: соседа по лестнице выше 720p не существует, поэтому при
      // площади больше потолка ветка и так не берётся (`upperLadderRung` — undefined). Оставлено,
      // чтобы правило владельца «не выше потолка 720p по площади» читалось в коде буквально, а не
      // выводилось из формы лестницы (аудит 11.09, F-3).
      sourceArea <= SOURCE_FRAME_TOP_RUNG_PIXEL_CEILING
    ) {
      const topRung = deriveSourceFrameTopRung(sourceWidth, sourceHeight, largest, upperLadderRung);
      /*
       * Короткая сторона источника численно совпадает с меткой ступени лестницы (например
       * 900x480 — короткая сторона 480, как и у фиксированной ступени `480p`, хотя её родной
       * кадр другой): без различки обе ступени легли бы в один каталог `hls/480p` и в одну
       * строку `qualitiesJson`, затирая друг друга. Редкий сверхширокий/сверхузкий случай, не
       * встречавшийся в замере библиотеки, но каталог не должен ломаться, если он случится.
       */
      if (fitting.some((rung) => rung.label === topRung.label)) {
        topRung.label = `${topRung.label}-src`;
      }
      fitting.push(topRung);
    }
    return fitting;
  }
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

/**
 * Капкан fMP4 (`VIDEO_DELIVERY_COST_AND_METERING`, «Капкан, проверь его первым»): фрагмент `.m4s`
 * сам по себе — только `moof`+`mdat`, без `ftyp`+`moov` из init-сегмента, и ffprobe его в одиночку
 * не декодирует — тихо вернёт `null`, и в манифест уедут номинальные размеры вместо измеренных.
 * Склеиваем init-сегмент с первым фрагментом в один временный файл — валидный фрагментированный
 * MP4 — и пробуем ЕГО.
 */
export async function probeFmp4VariantFrame(
  ffmpegBin: string,
  rungDir: string,
  initSegmentRelative: string,
  firstSegmentName: string,
): Promise<VideoSourceProbe | null> {
  const probeFile = join(rungDir, '.probe-init-plus-segment.mp4');
  try {
    const [initBuf, segBuf] = await Promise.all([
      readFile(join(rungDir, initSegmentRelative)),
      readFile(join(rungDir, firstSegmentName)),
    ]);
    await writeFile(probeFile, Buffer.concat([initBuf, segBuf]));
    return await probeVideoDimensions(ffmpegBin, probeFile, 60_000);
  } catch {
    return null;
  } finally {
    await rm(probeFile, { force: true }).catch(() => {
      /* best-effort cleanup of the probe scratch file */
    });
  }
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
   * исходника, выкладка HLS и постера — происходит внутри него.
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
 * End-to-end transcode (FFmpeg + S3). Source MP4 at `s3_key` is kept after a successful HLS
 * transcode (owner decision 2026-09-11, `VIDEO_DELIVERY_COST_AND_METERING` — cold-bucket relocation
 * for sources is a separate later step; this branch only stops deleting it).
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
         * Backfill from the already-produced HLS playlist, never the source: rows transcoded before
         * the source-retention decision (`VIDEO_DELIVERY_COST_AND_METERING`, 2026-09-11) already had
         * their source deleted, so re-downloading `s3_key` here silently no-ops on those rows — that
         * is exactly why duration was only ever recorded for 3 of 192 rows. The variant playlist
         * always exists once HLS is `ready`, deleted source or not.
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

    const sourceProbe = await probeVideoDimensions(ctx.ffmpegBin, src, 60_000);
    if (!sourceProbe) {
      await retryableFail(ctx, job, ctx.maxAttempts, 'ffprobe_source_dimensions_failed');
      return;
    }
    const rungs = deriveEligibleHlsRungs(sourceProbe.width, sourceProbe.height);
    const sourceBitrateBps = sourceProbe.bitrateBps;

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
          segmentFilename: 'seg_%03d.m4s',
          initSegmentFilename: HLS_FMP4_INIT_SEGMENT_FILENAME,
          videoFilter,
          videoBitrateCeilingBps: rungVideoCeilingFromProbeBps(rung.videoBitrate, sourceProbe),
          audioBitrateBps: rungAudioBitrateBps(rung.audioBitrate, sourceProbe.audioBitrateBps),
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
      const initSegmentRelative = hlsMapUriFromVariantPlaylist(variantPlaylistBody);
      const measured =
        firstSegment && initSegmentRelative
          ? await probeFmp4VariantFrame(ctx.ffmpegBin, rungDir, initSegmentRelative, firstSegment)
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
    // Duration from the produced playlist (sum of EXTINF), not the source: the source itself is no
    // longer downloaded once a job's HLS is already `ready` (see the early backfill branch above),
    // so the produced playlist is the one path guaranteed to exist. Any produced rung's timeline
    // matches the source.
    const videoDurationSeconds = sumHlsExtinfDurationSeconds(producedRungs[0]!.variantPlaylistBody);
    await ctx.control.doneHls(job, ctx.lockId, {
      masterKey,
      artifactPrefix: hlsBaseKeyPrefix,
      posterKey,
      qualitiesJson,
      durationSeconds: roundVideoDurationSecondsForStorage(videoDurationSeconds),
      // Same probe as the ladder-selection dimensions above, travels out alongside duration.
      sourceBitrateBps,
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

    // Исходник НЕ удаляется (решение владельца 11.09.2026: «исходники в холодный бакет»). Удаление
    // стояло здесь и на Selectel реально исполнялось — три упражнения от 29.08.2026 потеряли свои
    // оригиналы, и перекодировать их под новую лестницу больше нечем. Оригинал — единственный вход для
    // любой будущей смены лестницы, поэтому он остаётся жить; перекладывание в холодный бакет —
    // следующий шаг того же решения.
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    ctx.log.error({ err: e, jobId: job.id }, 'transcode unexpected error');
    await retryableFail(ctx, job, ctx.maxAttempts, msg);
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
}
