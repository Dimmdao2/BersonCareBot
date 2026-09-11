import { createWriteStream } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import sharp from 'sharp';
import { and, asc, eq, isNotNull, isNull, lte, notInArray, or, sql } from 'drizzle-orm';
import { env } from '@/config/env';
import { getPool } from '@/infra/db/client';
import { getWebappSqlFromPgClient, runWebappSql } from '@/infra/db/runWebappSql';
import { withPoolTransaction } from '@/infra/db/withClient';
import { logger } from '@/infra/logging/logger';
import { mediaFiles } from '../../../db/schema/schema';
import {
  parseStorageTarget,
  presignGetUrl,
  s3GetObjectBody,
  s3HeadObject,
  s3PreviewKey,
  s3PutObjectBody,
  s3StandardImageKey,
  sourceStorageKindForKey,
} from '@/infra/s3/client';
import type { StorageKind } from '@/infra/s3/client';
import type { StorageTarget } from '@/shared/types/storageTarget';
import {
  buildImageStandardRendition,
  encodeStandardImageRendition,
} from '@/modules/media/imageStandardRendition';
import {
  FFMPEG_STDERR_TAIL_BYTES,
  FFPROBE_STDOUT_MAX_BYTES,
  buildPosterArgs,
  buildProbeDimensionsArgs,
  ffmpegFailureMessage,
  ffprobeCandidates,
  parseProbeDimensions,
  runFirstAvailable,
  runProcess,
} from '@/infra/media/ffmpegPreview';
import { MAX_MEDIA_BYTES } from '@/modules/media/uploadAllowedMime';
import { resolveHostedVideoThumbnail } from '@/shared/lib/hostedVideoThumbnail';

const resolvedFfmpegPath = env.FFMPEG_PATH || 'ffmpeg';
/**
 * `FFPROBE_PATH` читается напрямую из окружения: так его брала снятая обёртка `fluent-ffmpeg`,
 * отдельным объявленным ключом конфигурации он никогда не был.
 */
const resolvedFfprobeCandidates = ffprobeCandidates(resolvedFfmpegPath, process.env.FFPROBE_PATH);
logger.info(
  { path: resolvedFfmpegPath, ffprobe: resolvedFfprobeCandidates },
  '[mediaPreviewWorker] ffmpeg path set',
);

const MAX_PREVIEW_ATTEMPTS = 5;
/** Avoid loading multi‑hundred‑MB originals into Node for sharp (heap OOM). */
const MAX_IMAGE_PREVIEW_BYTES = 50 * 1024 * 1024;
/** Keep preview source ceiling aligned with media upload ceiling. */
const MAX_PREVIEW_SOURCE_BYTES = MAX_MEDIA_BYTES;
const FFMPEG_EXTRACT_TIMEOUT_MS = 120_000;
/**
 * Обложки ролика на этом хостинге не будет никогда: ролик удалён/приватный, провайдер обложек не
 * отдаёт, либо он вообще не из тех, кого мы умеем спрашивать. Это `skipped` — «превью не
 * создаётся», ровно как у файла, который нечем сконвертировать, а не ошибка обработки.
 */
const HOSTED_PREVIEW_UNAVAILABLE = 'hosted_video_preview_unavailable';
/** Временная причина (сеть, лимит провайдера, ещё не заведён сервисный токен VK). */
const HOSTED_PREVIEW_RETRY = 'hosted_video_preview_retry';

const PERMANENT_ERROR_PATTERNS = [
  'compression format has not been built in',
  'Input buffer contains unsupported image format',
  'Invalid data found when processing input',
  'was killed with signal SIGSEGV',
  HOSTED_PREVIEW_UNAVAILABLE,
] as const;

export type ProcessMediaPreviewBatchResult = {
  processed: number;
  errors: number;
  /** Present only in reconciliation mode. */
  requeued?: number;
};

export type ProcessMediaPreviewBatchOptions = {
  /** Requeue at most this batch's old ready images that still have no standard rendition. */
  reconcileMissingImageRenditions?: boolean;
};

type MediaPreviewIterationOutcome = 'empty' | 'processed' | 'error';

type MediaPreviewIterationResult = {
  outcome: MediaPreviewIterationOutcome;
};

function backoffMinutesAfterFailure(attemptsAfterIncrement: number): number {
  const exp = Math.min(attemptsAfterIncrement, 20);
  return Math.min(1440, Math.pow(2, exp));
}

function isPermanentPreviewError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return PERMANENT_ERROR_PATTERNS.some((p) => msg.includes(p));
}

/** Best-effort width/height from ffprobe (video or still image in container). */
async function ffprobeSourceDimensions(
  url: string,
): Promise<{ width: number; height: number } | null> {
  const result = await runFirstAvailable(resolvedFfprobeCandidates, buildProbeDimensionsArgs(url), {
    timeoutMs: FFMPEG_EXTRACT_TIMEOUT_MS,
    maxStderrBytes: FFMPEG_STDERR_TAIL_BYTES,
    maxStdoutBytes: FFPROBE_STDOUT_MAX_BYTES,
  });
  if (result.signal || result.code !== 0) {
    throw new Error(ffmpegFailureMessage(result, 'ffprobe'));
  }
  return parseProbeDimensions(result.stdout);
}

async function extractVideoPosterJpeg(presignedUrl: string, seekSeconds: number): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'media-prev-v-'));
  try {
    const outPath = join(dir, 'poster.jpg');
    const result = await runProcess(
      resolvedFfmpegPath,
      buildPosterArgs(presignedUrl, outPath, seekSeconds),
      {
        timeoutMs: FFMPEG_EXTRACT_TIMEOUT_MS,
        maxStderrBytes: FFMPEG_STDERR_TAIL_BYTES,
        maxStdoutBytes: 0,
      },
    );
    if (result.signal || result.code !== 0) {
      throw new Error(ffmpegFailureMessage(result));
    }
    return await readFile(outPath);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function videoPosterJpegRaw(
  s3Key: string,
  target: StorageTarget,
  kind: StorageKind,
): Promise<Buffer> {
  const url1 = await presignGetUrl(s3Key, undefined, target, undefined, kind);
  try {
    return await extractVideoPosterJpeg(url1, 1);
  } catch (e1) {
    logger.warn({ err: e1 }, '[mediaPreviewWorker] video poster @1s failed, retry @0');
    const url0 = await presignGetUrl(s3Key, undefined, target, undefined, kind);
    return await extractVideoPosterJpeg(url0, 0);
  }
}

/** Thumbnails are derived from our own re-encoded output, never from the raw upload. */
async function thumbnailsSmMd(raw: Buffer): Promise<{ sm: Buffer; md: Buffer }> {
  const sm = await sharp(raw)
    .rotate()
    .resize(160, 160, { fit: 'inside' })
    .jpeg({ quality: 82 })
    .toBuffer();
  const md = await sharp(raw)
    .rotate()
    .resize(400, 400, { fit: 'inside' })
    .jpeg({ quality: 85 })
    .toBuffer();
  return { sm, md };
}

function resolveMagickCommand(): string[] {
  const custom = env.MAGICK_PATH?.trim();
  if (custom) {
    return [custom];
  }
  return ['magick', 'convert'];
}

async function downloadFileToPath(url: string, outPath: string): Promise<void> {
  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), FFMPEG_EXTRACT_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('download_timeout');
    }
    throw e;
  } finally {
    clearTimeout(abortTimer);
  }
  if (!response.ok || !response.body) {
    throw new Error(`download_failed_status_${response.status}`);
  }
  await pipeline(Readable.fromWeb(response.body as never), createWriteStream(outPath));
}

function runMagickConvert(inputPath: string, outPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const candidates = resolveMagickCommand();
    let idx = 0;

    const runNext = () => {
      if (idx >= candidates.length) {
        reject(new Error('magick_not_found_or_failed'));
        return;
      }
      const command = candidates[idx++]!;
      const args = [inputPath + '[0]', '-auto-orient', '-quality', '85', outPath];
      const child = spawn(command, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
      });
      let stderr = '';
      child.stderr.on('data', (chunk) => {
        stderr += String(chunk);
      });
      const killTimer = setTimeout(() => {
        child.kill('SIGKILL');
      }, FFMPEG_EXTRACT_TIMEOUT_MS);
      child.on('error', (err) => {
        clearTimeout(killTimer);
        const code = (err as NodeJS.ErrnoException).code;
        if (code === 'ENOENT' && idx < candidates.length) {
          runNext();
          return;
        }
        reject(err);
      });
      child.on('close', (code) => {
        clearTimeout(killTimer);
        if (code === 0) {
          resolve();
          return;
        }
        if (idx < candidates.length) {
          runNext();
          return;
        }
        reject(new Error(`magick_failed_code_${code}: ${stderr}`));
      });
    };

    runNext();
  });
}

/**
 * Full-size JPEG decoded from a HEIC/HEIF upload. sharp's HEIC support is not guaranteed on the
 * deploy host, so decoding stays on the proven ffmpeg path with an ImageMagick fallback
 * (`-auto-orient`); the JPEG it produces is what the standard-rendition encoder re-encodes.
 */
async function heicFullSizeJpeg(
  s3Key: string,
  target: StorageTarget,
  kind: StorageKind,
): Promise<Buffer> {
  try {
    return await videoPosterJpegRaw(s3Key, target, kind);
  } catch (ffmpegErr) {
    logger.warn(
      { err: ffmpegErr },
      '[mediaPreviewWorker] heic ffmpeg decode failed, retry via magick',
    );
  }

  let dir: string | null = null;
  try {
    dir = await mkdtemp(join(tmpdir(), 'media-prev-heic-'));
    const inputPath = join(dir, 'input.heic');
    const outputPath = join(dir, 'out.jpg');
    const url = await presignGetUrl(s3Key, undefined, target, undefined, kind);
    await downloadFileToPath(url, inputPath);
    await runMagickConvert(inputPath, outputPath);
    return await readFile(outputPath);
  } finally {
    if (dir) {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

type WebappTxSql = Parameters<typeof runWebappSql>[0];

/**
 * Re-encodes an image to the standard rendition and stores it ALONGSIDE the raw upload — М7
 * (`docs/_TODO/STORAGE_PACKAGES_2026-09-10.md`) reverses the 19.08.2026 SECURITY_CANON §5 rule
 * that the rendition replaces `s3_key` and the original is deleted. The original now lives
 * forever in the raw bucket (owner 10.09.2026: «оно не исполняется ни при каком варианте, снаружи
 * к нему доступа тоже нет» — a bucket, not a delete, is the guarantee); the rendition goes to the
 * hot bucket under the deterministic key `s3StandardImageKey(mediaId)`, never `s3_key` itself.
 *
 * Ordering — the rendition is the only new fact, so a failure at any step before COMMIT just
 * leaves `preview_status = 'pending'` for the next attempt to redo (the rendition key is
 * deterministic, so a half-written retry overwrites its own object, never doubles up):
 *   encode -> PUT rendition (hot) -> HEAD verify -> PUT thumbnails (hot) -> UPDATE row -> COMMIT.
 *
 * `standard_rendition_at` is set by this same UPDATE and by nothing else: it is the row's only
 * fact that a safe rendition exists at `s3StandardImageKey(mediaId)` in the hot bucket — every
 * delivery door that might otherwise serve `s3_key` inline reads this column FIRST
 * (`resolveDeliverableMediaObject` in `s3MediaStorage.ts`) and prefers the rendition when set.
 */
async function applyStandardImageRendition(
  db: WebappTxSql,
  mediaId: string,
  source: Buffer,
  smKey: string,
  mdKey: string,
  target: StorageTarget,
): Promise<void> {
  const outcome = await buildImageStandardRendition(
    {
      standardKey: s3StandardImageKey(mediaId),
      smKey,
      mdKey,
      source,
    },
    {
      encode: encodeStandardImageRendition,
      putObject: (key, body, mimeType) => s3PutObjectBody(key, body, mimeType, target),
      headObject: (key) => s3HeadObject(key, target),
      thumbnails: thumbnailsSmMd,
    },
  );
  await runWebappSql(
    db,
    sql`UPDATE media_files SET
           mime_type = ${outcome.mimeType},
           preview_status = 'ready',
           preview_sm_key = ${outcome.smKey},
           preview_md_key = ${outcome.mdKey},
           preview_attempts = 0,
           preview_next_attempt_at = NULL,
           source_width = ${outcome.width},
           source_height = ${outcome.height},
           standard_rendition_at = now()
         WHERE id = ${mediaId}::uuid`,
  );
  logger.info(
    {
      mediaId,
      standardKey: outcome.standardKey,
      sizeBytes: outcome.sizeBytes,
      width: outcome.width,
      height: outcome.height,
    },
    '[mediaPreviewWorker] standard rendition stored',
  );
}

/**
 * Background worker: generate preview JPEGs in MinIO and set preview_status=ready.
 * Pattern: same cron + INTERNAL_JOB_SECRET as media-pending-delete purge.
 */
export async function processMediaPreviewBatch(
  limit: number = 10,
  options: ProcessMediaPreviewBatchOptions = {},
): Promise<ProcessMediaPreviewBatchResult> {
  const pool = getPool();
  const take = Math.max(1, Math.min(50, limit));
  let requeued = 0;
  let processed = 0;
  let errors = 0;

  if (options.reconcileMissingImageRenditions === true) {
    requeued = await withPoolTransaction<number>(pool, async (client) => {
      const result = await runWebappSql<{ id: string }>(
        getWebappSqlFromPgClient(client),
        sql`WITH candidates AS (
              SELECT id
                FROM media_files
               WHERE status = 'ready'
                 AND mime_type LIKE 'image/%'
                 AND s3_key IS NOT NULL
                 AND length(trim(s3_key)) > 0
                 AND standard_rendition_at IS NULL
                 AND preview_status IS DISTINCT FROM 'pending'
               ORDER BY created_at, id
               FOR UPDATE SKIP LOCKED
               LIMIT ${take}
            )
            UPDATE media_files AS media
               SET preview_status = 'pending',
                   preview_attempts = 0,
                   preview_next_attempt_at = NULL
              FROM candidates
             WHERE media.id = candidates.id
          RETURNING media.id::text`,
      );
      return result.rows.length;
    });
  }

  for (let i = 0; i < take; i++) {
    const result = await withPoolTransaction<MediaPreviewIterationResult>(pool, async (client) => {
      const db = getWebappSqlFromPgClient(client);
      const rows = await db
        .select({
          id: mediaFiles.id,
          s3_key: mediaFiles.s3Key,
          mime_type: mediaFiles.mimeType,
          size_bytes: mediaFiles.sizeBytes,
          preview_attempts: mediaFiles.previewAttempts,
          source_width: mediaFiles.sourceWidth,
          source_height: mediaFiles.sourceHeight,
          usage_purpose: mediaFiles.usagePurpose,
          hosted_video_source_url: mediaFiles.hostedVideoSourceUrl,
          storage_target: mediaFiles.storageTarget,
        })
        .from(mediaFiles)
        .where(
          and(
            eq(mediaFiles.previewStatus, 'pending'),
            or(
              and(isNotNull(mediaFiles.s3Key), sql`length(trim(${mediaFiles.s3Key})) > 0`),
              eq(mediaFiles.usagePurpose, 'hosted_video_preview'),
            ),
            or(
              isNull(mediaFiles.status),
              notInArray(mediaFiles.status, ['pending', 'deleting', 'pending_delete']),
            ),
            or(
              isNull(mediaFiles.previewNextAttemptAt),
              lte(mediaFiles.previewNextAttemptAt, new Date().toISOString()),
            ),
          ),
        )
        .orderBy(asc(mediaFiles.createdAt))
        .limit(1)
        .for('update', { skipLocked: true });

      if (rows.length === 0) {
        return { outcome: 'empty' };
      }

      const row = rows[0]!;
      if (row.source_width == null && row.source_height == null) {
        logger.debug(
          { mediaId: row.id },
          '[mediaPreviewWorker] backfill: source dimensions NULL before processing',
        );
      }
      const mime = row.mime_type.toLowerCase();
      const sizeBytes = Number(row.size_bytes) || 0;
      const smKey = s3PreviewKey(row.id, 'sm');
      const mdKey = s3PreviewKey(row.id, 'md');

      /* Ветки ниже работают только с уже лежащим у нас объектом: claim их без ключа не выдаёт. */
      const storedKey = row.s3_key?.trim() ?? '';
      /* Превью и стандартный рендер ложатся туда же, где лежит исходник, — иначе строка укажет
         на объект в другом бакете, и дверь доставки его не найдёт. */
      const storageTarget = parseStorageTarget(row.storage_target);
      /* Раскладка исходника М7: `library` лежит в сыром бакете, читаем оттуда, пишем рендишн в
         горячий — КРОМЕ ещё не перенесённых старых исходников (F-1), которые форма ключа относит
         к горячему; `sourceStorageKindForKey` решает по ключу, а не только по цели. */
      const rawKind: StorageKind = sourceStorageKindForKey(storageTarget, storedKey);
      const hostedSourceUrl =
        row.usage_purpose === 'hosted_video_preview' &&
        !row.s3_key?.trim() &&
        row.hosted_video_source_url?.trim()
          ? row.hosted_video_source_url.trim()
          : null;

      try {
        if (hostedSourceUrl) {
          /* Единственное место, где мы ходим к чужому хосту. Наружу уходят только наши ключи:
               байты сразу перекодируются нашим энкодером и ложатся в приватный бакет. */
          const outcome = await resolveHostedVideoThumbnail(hostedSourceUrl);
          if (outcome.kind === 'terminal') {
            throw new Error(`${HOSTED_PREVIEW_UNAVAILABLE}: ${outcome.reason}`);
          }
          if (outcome.kind === 'retryable') {
            throw new Error(`${HOSTED_PREVIEW_RETRY}: ${outcome.reason}`);
          }
          await applyStandardImageRendition(
            db,
            row.id,
            outcome.bytes,
            smKey,
            mdKey,
            storageTarget,
          );
        } else if (mime === 'image/heic' || mime === 'image/heif') {
          if (sizeBytes > MAX_PREVIEW_SOURCE_BYTES) {
            await runWebappSql(
              db,
              sql`UPDATE media_files SET preview_status = 'skipped', preview_next_attempt_at = NULL WHERE id = ${row.id}::uuid`,
            );
            logger.info(
              { mediaId: row.id, sizeBytes, max: MAX_PREVIEW_SOURCE_BYTES },
              '[processMediaPreviewBatch] heic/heif too large for ffmpeg preview, skipped',
            );
          } else {
            const decoded = await heicFullSizeJpeg(storedKey, storageTarget, rawKind);
            await applyStandardImageRendition(
              db,
              row.id,
              decoded,
              smKey,
              mdKey,
              storageTarget,
            );
          }
        } else if (mime.startsWith('image/') && sizeBytes > MAX_IMAGE_PREVIEW_BYTES) {
          await runWebappSql(
            db,
            sql`UPDATE media_files SET preview_status = 'skipped', preview_next_attempt_at = NULL WHERE id = ${row.id}::uuid`,
          );
          logger.info(
            { mediaId: row.id, sizeBytes, max: MAX_IMAGE_PREVIEW_BYTES },
            '[processMediaPreviewBatch] image too large for in-process preview, skipped',
          );
        } else if (mime.startsWith('video/') && sizeBytes > MAX_PREVIEW_SOURCE_BYTES) {
          await runWebappSql(
            db,
            sql`UPDATE media_files SET preview_status = 'skipped', preview_next_attempt_at = NULL WHERE id = ${row.id}::uuid`,
          );
          logger.info(
            { mediaId: row.id, sizeBytes, max: MAX_PREVIEW_SOURCE_BYTES },
            '[processMediaPreviewBatch] video too large for ffmpeg preview, skipped',
          );
        } else if (mime.startsWith('image/')) {
          const raw = await s3GetObjectBody(storedKey, storageTarget, rawKind);
          if (!raw) {
            throw new Error('s3_get_object_empty');
          }
          await applyStandardImageRendition(
            db,
            row.id,
            raw,
            smKey,
            mdKey,
            storageTarget,
          );
        } else if (mime.startsWith('video/')) {
          const presigned = await presignGetUrl(storedKey, undefined, storageTarget, undefined, rawKind);
          let sw: number | null = null;
          let sh: number | null = null;
          try {
            const dims = await ffprobeSourceDimensions(presigned);
            if (dims) {
              sw = dims.width;
              sh = dims.height;
            }
          } catch (e) {
            logger.warn(
              { err: e, mediaId: row.id },
              '[mediaPreviewWorker] video dimension probe failed',
            );
          }
          const rawPoster = await videoPosterJpegRaw(storedKey, storageTarget, rawKind);
          const { sm: posterSm, md: posterMd } = await thumbnailsSmMd(rawPoster);
          await s3PutObjectBody(smKey, posterSm, 'image/jpeg', storageTarget);
          await s3PutObjectBody(mdKey, posterMd, 'image/jpeg', storageTarget);
          await runWebappSql(
            db,
            sql`UPDATE media_files SET
               preview_status = 'ready',
               preview_sm_key = ${smKey},
               preview_md_key = ${mdKey},
               preview_attempts = 0,
               preview_next_attempt_at = NULL,
               source_width = ${sw},
               source_height = ${sh}
             WHERE id = ${row.id}::uuid`,
          );
          if (sw != null && sh != null) {
            logger.info(
              { mediaId: row.id, width: sw, height: sh },
              '[mediaPreviewWorker] source dimensions stored',
            );
          }
        } else {
          await runWebappSql(
            db,
            sql`UPDATE media_files SET preview_status = 'skipped', preview_next_attempt_at = NULL WHERE id = ${row.id}::uuid`,
          );
        }
      } catch (e) {
        if (isPermanentPreviewError(e)) {
          await runWebappSql(
            db,
            sql`UPDATE media_files SET preview_status = 'skipped', preview_next_attempt_at = NULL WHERE id = ${row.id}::uuid`,
          );
          logger.warn(
            { err: e, mediaId: row.id },
            '[processMediaPreviewBatch] permanent error, skipped',
          );
          return { outcome: 'processed' };
        }
        const prev = row.preview_attempts ?? 0;
        const nextAttempts = prev + 1;
        if (nextAttempts >= MAX_PREVIEW_ATTEMPTS) {
          await runWebappSql(
            db,
            sql`UPDATE media_files SET
               preview_status = 'failed',
               preview_attempts = ${nextAttempts},
               preview_next_attempt_at = NULL
             WHERE id = ${row.id}::uuid`,
          );
        } else {
          const minutes = backoffMinutesAfterFailure(nextAttempts);
          await runWebappSql(
            db,
            sql`UPDATE media_files SET
               preview_attempts = ${nextAttempts},
               preview_next_attempt_at = now() + (${minutes}::numeric * interval '1 minute')
             WHERE id = ${row.id}::uuid`,
          );
        }
        logger.error({ err: e, mediaId: row.id }, '[processMediaPreviewBatch] preview failed');
        return { outcome: 'error' };
      }

      return { outcome: 'processed' };
    });

    const { outcome } = result;

    if (outcome === 'empty') {
      break;
    }
    if (outcome === 'error') {
      errors += 1;
      continue;
    }
    if (outcome === 'processed') {
      processed += 1;
    }
  }

  return options.reconcileMissingImageRenditions === true
    ? { processed, errors, requeued }
    : { processed, errors };
}
