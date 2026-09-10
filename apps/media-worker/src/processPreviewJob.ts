import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractPosterWithFallback } from './ffmpeg/extractPosterWithFallback.js';
import {
  encodeStandardImageRendition,
  imageDimensions,
  thumbnailsSmMd,
} from './imageRendition.js';
import { runMagickConvert } from './magickConvert.js';
import { downloadObjectToFile, headObjectExists, putObjectWithRetry } from './s3.js';
import type { MediaPreviewOrder, MediaWorkerControlPort } from './control.js';
import type { Logger } from './logger.js';
import type { StorageBinding } from './s3.js';
import type { StorageTarget } from './storageTarget.js';

/**
 * Разбор чужих байт ради превью: картинка, HEIC, обложка чужого ролика, кадр видео.
 *
 * Это и есть весь смысл М7 (`docs/_TODO/STORAGE_PACKAGES_2026-09-10.md`): до 10.09.2026 эти четыре
 * ветки крутились ВНУТРИ процесса Next.js — рядом с пулами к базе, сессионным секретом и живыми
 * запросами врачей и пациентов. Дефект памяти в libvips, ImageMagick или ffmpeg приземлялся прямо
 * на данные пациентов. Теперь они крутятся здесь: у процесса нет ни строки подключения к БД
 * (`env.ts` падает, если ей подсунуть учётные данные), ни HTTP-порта, ни ключей mTLS.
 *
 * Решения тут не принимаются. Что делать со строкой, какие ключи у вывода, считать ли ошибку
 * постоянной и когда повторить — всё это вебапп сказал в наряде или скажет по отчёту.
 *
 * Вход ffmpeg — ВСЕГДА локальный файл: подписанный HTTPS-URL, который раньше уходил в `-i`, здесь
 * не появляется вовсе, а `-protocol_whitelist file` не даёт контейнеру увести ffmpeg по ссылке,
 * спрятанной внутри него.
 */

const PROTOCOL_WHITELIST_LOCAL_FILE = 'file';

export type PreviewContext = {
  control: MediaWorkerControlPort;
  storageFor: (target: StorageTarget) => StorageBinding;
  ffmpegBin: string;
  /** Отдельный от HLS потолок: разбор одного кадра — минуты, а не часы. */
  previewTimeoutMs: number;
  magickCandidates: readonly string[];
  log: Logger;
};

/** Короткий код для структурного лога: без многострочного stderr и без имён объектов. */
function compactPreviewErrorCode(message: string): string {
  const oneLine = message.trim().replace(/\s+/g, ' ');
  const colon = oneLine.indexOf(':');
  if (colon > 0 && colon <= 72) return oneLine.slice(0, colon);
  return oneLine.slice(0, 80);
}

async function withTempDir<T>(prefix: string, fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function downloadToTemp(
  binding: StorageBinding,
  key: string,
  dir: string,
  name: string,
): Promise<string> {
  const path = join(dir, name);
  await downloadObjectToFile(binding.client, binding.bucket, key, path);
  return path;
}

/** Полноразмерный JPEG одного кадра: и постер видео, и разобранный HEIC получаются так. */
async function stillFrameJpeg(
  ctx: PreviewContext,
  inputFile: string,
  dir: string,
): Promise<Buffer> {
  const outputJpg = join(dir, 'frame.jpg');
  await extractPosterWithFallback({
    ffmpegBin: ctx.ffmpegBin,
    inputFile,
    outputJpg,
    cwd: dir,
    timeoutMs: ctx.previewTimeoutMs,
    protocolWhitelist: PROTOCOL_WHITELIST_LOCAL_FILE,
  });
  return readFile(outputJpg);
}

/**
 * HEIC/HEIF: sharp его на хосте деплоя не гарантирует, поэтому сначала ffmpeg, а если он не понял —
 * ImageMagick. То, что получилось, дальше идёт в наш собственный энкодер как обычная картинка.
 */
async function decodeHeicJpeg(
  ctx: PreviewContext,
  binding: StorageBinding,
  sourceKey: string,
): Promise<Buffer> {
  return withTempDir('media-prev-heic-', async (dir) => {
    const inputFile = await downloadToTemp(binding, sourceKey, dir, 'input.heic');
    try {
      return await stillFrameJpeg(ctx, inputFile, dir);
    } catch (ffmpegErr) {
      ctx.log.warn({ err: ffmpegErr }, 'heic ffmpeg decode failed, retry via magick');
    }
    const outputPath = join(dir, 'magick.jpg');
    await runMagickConvert({
      candidates: ctx.magickCandidates,
      inputPath: inputFile,
      outputPath,
      timeoutMs: ctx.previewTimeoutMs,
    });
    return readFile(outputPath);
  });
}

/**
 * Стандартный рендишн и два эскиза в хранилище — в том порядке, который делает исходник
 * необязательным только в самом конце (решение владельца 19.08.2026, SECURITY_CANON §5):
 * encode → PUT рендишна → HEAD (он действительно лежит) → PUT эскизов → и лишь затем отчёт,
 * по которому вебапп перенаправит строку и удалит вытесненный исходник.
 *
 * Отказ на любом шаге не доходит до отчёта, то есть исходник остаётся единственной копией и
 * следующая попытка начинает с него же.
 */
async function storeStandardRendition(
  ctx: PreviewContext,
  order: MediaPreviewOrder,
  binding: StorageBinding,
  source: Buffer,
): Promise<void> {
  const rendition = await encodeStandardImageRendition(source);
  await putObjectWithRetry(
    binding.client,
    binding.bucket,
    order.standardKey,
    rendition.buffer,
    rendition.mimeType,
    ctx.log,
  );
  const stored = await headObjectExists(binding.client, binding.bucket, order.standardKey);
  if (!stored) throw new Error('standard_rendition_head_missing_after_upload');
  const { sm, md } = await thumbnailsSmMd(rendition.buffer);
  await putObjectWithRetry(binding.client, binding.bucket, order.smKey, sm, 'image/jpeg', ctx.log);
  await putObjectWithRetry(binding.client, binding.bucket, order.mdKey, md, 'image/jpeg', ctx.log);
  await ctx.control.previewDoneImage(order.mediaId, {
    mimeType: rendition.mimeType,
    sizeBytes: rendition.buffer.byteLength,
    width: rendition.width,
    height: rendition.height,
  });
}

/** Видео: исходник не трогаем, эскизы делаем из НАШЕГО кадра, размер берём у него же. */
async function storeVideoPoster(
  ctx: PreviewContext,
  order: MediaPreviewOrder,
  binding: StorageBinding,
  sourceKey: string,
): Promise<void> {
  const poster = await withTempDir('media-prev-v-', async (dir) => {
    const inputFile = await downloadToTemp(binding, sourceKey, dir, 'input.bin');
    return stillFrameJpeg(ctx, inputFile, dir);
  });
  const dims = await imageDimensions(poster).catch(() => null);
  const { sm, md } = await thumbnailsSmMd(poster);
  await putObjectWithRetry(binding.client, binding.bucket, order.smKey, sm, 'image/jpeg', ctx.log);
  await putObjectWithRetry(binding.client, binding.bucket, order.mdKey, md, 'image/jpeg', ctx.log);
  await ctx.control.previewDonePoster(order.mediaId, {
    width: dims?.width ?? null,
    height: dims?.height ?? null,
  });
}

/** Обложка чужого ролика: наружу за ней ходит вебапп, разбирает её — этот процесс. */
async function storeHostedThumbnail(
  ctx: PreviewContext,
  order: MediaPreviewOrder,
  binding: StorageBinding,
): Promise<void> {
  const outcome = await ctx.control.previewHostedBytes(order.mediaId);
  if (outcome.kind === 'error') throw new Error(outcome.error);
  await storeStandardRendition(ctx, order, binding, Buffer.from(outcome.bytesBase64, 'base64'));
}

export async function processPreviewOrder(
  ctx: PreviewContext,
  order: MediaPreviewOrder,
): Promise<'processed' | 'error'> {
  const binding = ctx.storageFor(order.storageTarget);
  const plan = order.plan;
  try {
    switch (plan.kind) {
      case 'image': {
        const source = await withTempDir('media-prev-img-', async (dir) => {
          const path = await downloadToTemp(binding, plan.sourceKey, dir, 'input.bin');
          return readFile(path);
        });
        await storeStandardRendition(ctx, order, binding, source);
        break;
      }
      case 'heic':
        await storeStandardRendition(
          ctx,
          order,
          binding,
          await decodeHeicJpeg(ctx, binding, plan.sourceKey),
        );
        break;
      case 'hosted_thumbnail':
        await storeHostedThumbnail(ctx, order, binding);
        break;
      case 'video_poster':
        await storeVideoPoster(ctx, order, binding, plan.sourceKey);
        break;
    }
    ctx.log.info({ mediaId: order.mediaId, plan: plan.kind }, 'preview_order_done');
    return 'processed';
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    /*
     * Классификацию отказа делает вебапп: «постоянная ошибка», «повторить через N минут» и
     * «попытки кончились» — это его правила. Воркер сообщает текст ошибки и не решает судьбу строки.
     */
    await ctx.control.previewFailed(order.mediaId, message);
    ctx.log.warn(
      {
        mediaId: order.mediaId,
        plan: plan.kind,
        attempts: order.attempts,
        errorCode: compactPreviewErrorCode(message),
      },
      'preview_order_failed',
    );
    return 'error';
  }
}
