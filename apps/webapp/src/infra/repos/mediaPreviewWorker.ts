import { createWriteStream } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffmpeg from 'fluent-ffmpeg';
import type { FfmpegCommand } from 'fluent-ffmpeg';
import sharp from 'sharp';
import { sql } from 'drizzle-orm';
import { env } from '@/config/env';
import { getPool } from '@/infra/db/client';
import { getWebappSqlFromPgClient, runWebappSql } from '@/infra/db/runWebappSql';
import { withPoolTransaction } from '@/infra/db/withClient';
import { logger } from '@/infra/logging/logger';
import { mediaReadableStatusPredicate } from '@/infra/repos/mediaSqlPredicates';
import {
  presignGetUrl,
  s3DeleteObject,
  s3GetObjectBody,
  s3HeadObject,
  s3PreviewKey,
  s3PutObjectBody,
  s3StandardImageKey,
} from '@/infra/s3/client';
import {
  buildImageStandardRendition,
  encodeStandardImageRendition,
} from '@/modules/media/imageStandardRendition';
import { MAX_MEDIA_BYTES } from '@/modules/media/uploadAllowedMime';

const resolvedFfmpegPath = env.FFMPEG_PATH || ffmpegInstaller.path;
try {
  ffmpeg.setFfmpegPath(resolvedFfmpegPath);
  logger.info({ path: resolvedFfmpegPath }, '[mediaPreviewWorker] ffmpeg path set');
} catch (e) {
  logger.warn({ err: e, path: resolvedFfmpegPath }, '[mediaPreviewWorker] ffmpeg path not set');
}

const MAX_PREVIEW_ATTEMPTS = 5;
/** Avoid loading multi‑hundred‑MB originals into Node for sharp (heap OOM). */
const MAX_IMAGE_PREVIEW_BYTES = 50 * 1024 * 1024;
/** Keep preview source ceiling aligned with media upload ceiling. */
const MAX_PREVIEW_SOURCE_BYTES = MAX_MEDIA_BYTES;
const FFMPEG_EXTRACT_TIMEOUT_MS = 120_000;
const PERMANENT_ERROR_PATTERNS = [
  'compression format has not been built in',
  'Input buffer contains unsupported image format',
  'Invalid data found when processing input',
  'was killed with signal SIGSEGV',
] as const;

export type ProcessMediaPreviewBatchResult = {
  processed: number;
  errors: number;
};

type MediaPreviewIterationOutcome = 'empty' | 'processed' | 'error';

type MediaPreviewIterationResult = {
  outcome: MediaPreviewIterationOutcome;
  /** Raw upload superseded by a standard rendition; deleted only after the transaction commits. */
  supersededOriginalKey?: string | null;
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
function ffprobeSourceDimensions(url: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(url, (err, metadata) => {
      if (err) {
        reject(err);
        return;
      }
      const streams = metadata.streams ?? [];
      const withDims = streams.filter(
        (s) =>
          typeof s.width === 'number' &&
          typeof s.height === 'number' &&
          s.width > 0 &&
          s.height > 0,
      );
      if (withDims.length === 0) {
        resolve(null);
        return;
      }
      const best = withDims.reduce((a, b) =>
        a.width! * a.height! >= b.width! * b.height! ? a : b,
      );
      resolve({ width: best.width!, height: best.height! });
    });
  });
}

function extractVideoPosterJpeg(presignedUrl: string, seekSeconds: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    void (async () => {
      let dir: string | null = null;
      const cleanup = async () => {
        if (!dir) return;
        const d = dir;
        dir = null;
        try {
          await rm(d, { recursive: true, force: true });
        } catch {
          /* ignore */
        }
      };

      try {
        dir = await mkdtemp(join(tmpdir(), 'media-prev-v-'));
        const outPath = join(dir, 'poster.jpg');
        const cmd: FfmpegCommand = ffmpeg(presignedUrl);
        const killTimer = setTimeout(() => {
          try {
            cmd.kill('SIGKILL');
          } catch {
            /* ignore */
          }
        }, FFMPEG_EXTRACT_TIMEOUT_MS);

        cmd
          .seekInput(seekSeconds)
          .outputOptions(['-frames:v', '1', '-q:v', '3'])
          .output(outPath)
          .on('end', async () => {
            clearTimeout(killTimer);
            try {
              const buf = await readFile(outPath);
              await cleanup();
              resolve(buf);
            } catch (e) {
              await cleanup();
              reject(e);
            }
          })
          .on('error', async (err) => {
            clearTimeout(killTimer);
            await cleanup();
            reject(err);
          })
          .run();
      } catch (e) {
        await cleanup();
        reject(e);
      }
    })().catch(reject);
  });
}

async function videoPosterJpegRaw(s3Key: string): Promise<Buffer> {
  const url1 = await presignGetUrl(s3Key);
  try {
    return await extractVideoPosterJpeg(url1, 1);
  } catch (e1) {
    logger.warn({ err: e1 }, '[mediaPreviewWorker] video poster @1s failed, retry @0');
    const url0 = await presignGetUrl(s3Key);
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
async function heicFullSizeJpeg(s3Key: string): Promise<Buffer> {
  try {
    return await videoPosterJpegRaw(s3Key);
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
    const url = await presignGetUrl(s3Key);
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
 * Re-encodes an image to the standard rendition, repoints the row at it, and reports the raw
 * upload the caller must delete AFTER this transaction commits.
 *
 * Ordering (owner ruling 19.08.2026, SECURITY_CANON §5) — the original is the only copy until
 * every one of these has succeeded:
 *   encode -> PUT rendition -> HEAD verify -> PUT thumbnails -> UPDATE row -> COMMIT -> delete.
 * A failure at any step throws into the caller's retry/backoff path with the original intact;
 * a rollback after the UPDATE leaves the row pointing at the original and only strands a
 * deterministic `standard.webp` that the next attempt overwrites.
 *
 * `standard_rendition_at` is set by this same UPDATE and by nothing else: it is the row's only
 * fact that the object at `s3_key` is our encoder's output rather than the user's upload. The UI
 * may show a stored file before its thumbnail exists only when this column is set — a key suffix
 * or a `image/webp` mime type would be a naming convention and a user-controlled field, not a fact.
 */
async function applyStandardImageRendition(
  db: WebappTxSql,
  mediaId: string,
  originalKey: string,
  source: Buffer,
  smKey: string,
  mdKey: string,
): Promise<string | null> {
  const outcome = await buildImageStandardRendition(
    {
      originalKey,
      standardKey: s3StandardImageKey(mediaId),
      smKey,
      mdKey,
      source,
    },
    {
      encode: encodeStandardImageRendition,
      putObject: s3PutObjectBody,
      headObject: s3HeadObject,
      thumbnails: thumbnailsSmMd,
    },
  );
  await runWebappSql(
    db,
    sql`UPDATE media_files SET
           s3_key = ${outcome.standardKey},
           mime_type = ${outcome.mimeType},
           size_bytes = ${outcome.sizeBytes},
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
  return outcome.supersededOriginalKey;
}

/**
 * Background worker: generate preview JPEGs in MinIO and set preview_status=ready.
 * Pattern: same cron + INTERNAL_JOB_SECRET as media-pending-delete purge.
 */
export async function processMediaPreviewBatch(
  limit: number = 10,
): Promise<ProcessMediaPreviewBatchResult> {
  const pool = getPool();
  const take = Math.max(1, Math.min(50, limit));
  let processed = 0;
  let errors = 0;

  for (let i = 0; i < take; i++) {
    const result = await withPoolTransaction<MediaPreviewIterationResult>(
      pool,
      async (client) => {
        let supersededOriginalKey: string | null = null;
        const db = getWebappSqlFromPgClient(client);
        const claim = await runWebappSql<{
          id: string;
          s3_key: string;
          mime_type: string;
          size_bytes: string;
          preview_attempts: number;
          source_width: number | null;
          source_height: number | null;
        }>(
          db,
          sql`SELECT id, s3_key, mime_type, size_bytes::text AS size_bytes, COALESCE(preview_attempts, 0)::int AS preview_attempts,
                source_width, source_height
         FROM media_files
         WHERE preview_status = 'pending'
           AND s3_key IS NOT NULL AND length(trim(s3_key)) > 0
           AND ${mediaReadableStatusPredicate}
           AND (preview_next_attempt_at IS NULL OR preview_next_attempt_at <= now())
         ORDER BY created_at ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED`,
        );
        const rows = claim.rows;

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
        const sizeBytes = Number.parseInt(row.size_bytes, 10) || 0;
        const smKey = s3PreviewKey(row.id, 'sm');
        const mdKey = s3PreviewKey(row.id, 'md');

        try {
          if (mime === 'image/heic' || mime === 'image/heif') {
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
              const decoded = await heicFullSizeJpeg(row.s3_key);
              supersededOriginalKey = await applyStandardImageRendition(
                db,
                row.id,
                row.s3_key,
                decoded,
                smKey,
                mdKey,
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
            const raw = await s3GetObjectBody(row.s3_key);
            if (!raw) {
              throw new Error('s3_get_object_empty');
            }
            supersededOriginalKey = await applyStandardImageRendition(
              db,
              row.id,
              row.s3_key,
              raw,
              smKey,
              mdKey,
            );
          } else if (mime.startsWith('video/')) {
            const presigned = await presignGetUrl(row.s3_key);
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
            const rawPoster = await videoPosterJpegRaw(row.s3_key);
            const { sm: posterSm, md: posterMd } = await thumbnailsSmMd(rawPoster);
            await s3PutObjectBody(smKey, posterSm, 'image/jpeg');
            await s3PutObjectBody(mdKey, posterMd, 'image/jpeg');
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
            return { outcome: 'error' };
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

        return { outcome: 'processed', supersededOriginalKey };
      },
    );

    const { outcome, supersededOriginalKey } = result;

    // Only now is the rendition durable AND the row committed to point at it, so the raw upload
    // is no longer the only copy. Best-effort: a failure here leaks bytes, never a patient photo.
    if (supersededOriginalKey) {
      try {
        await s3DeleteObject(supersededOriginalKey);
        logger.info(
          { sourceKey: supersededOriginalKey },
          '[mediaPreviewWorker] original deleted after standard rendition',
        );
      } catch (e) {
        logger.warn(
          { err: e, sourceKey: supersededOriginalKey },
          '[mediaPreviewWorker] original delete failed, non-fatal',
        );
      }
    }

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

  return { processed, errors };
}
