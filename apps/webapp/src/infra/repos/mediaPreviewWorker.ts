import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffmpeg from "fluent-ffmpeg";
import type { FfmpegCommand } from "fluent-ffmpeg";
import sharp from "sharp";
import { env } from "@/config/env";
import { getPool } from "@/infra/db/client";
import { logger } from "@/infra/logging/logger";
import { MEDIA_READABLE_STATUS_SQL } from "@/infra/repos/s3MediaStorage";
import { presignGetUrl, s3GetObjectBody, s3PreviewKey, s3PutObjectBody } from "@/infra/s3/client";

const resolvedFfmpegPath = env.FFMPEG_PATH || ffmpegInstaller.path;
try {
  ffmpeg.setFfmpegPath(resolvedFfmpegPath);
  logger.info({ path: resolvedFfmpegPath }, "[mediaPreviewWorker] ffmpeg path set");
} catch (e) {
  logger.warn({ err: e, path: resolvedFfmpegPath }, "[mediaPreviewWorker] ffmpeg path not set");
}

const MAX_PREVIEW_ATTEMPTS = 5;
/** Avoid loading multi‑hundred‑MB originals into Node for sharp (heap OOM). */
const MAX_IMAGE_PREVIEW_BYTES = 50 * 1024 * 1024;
/** Avoid unbounded ffmpeg work on huge sources (presigned HTTP read). */
const MAX_VIDEO_PREVIEW_BYTES = 200 * 1024 * 1024;
const FFMPEG_EXTRACT_TIMEOUT_MS = 120_000;
const PERMANENT_ERROR_PATTERNS = [
  "compression format has not been built in",
  "Input buffer contains unsupported image format",
  "Invalid data found when processing input",
  "was killed with signal SIGSEGV",
] as const;

export type ProcessMediaPreviewBatchResult = {
  processed: number;
  errors: number;
};

function backoffMinutesAfterFailure(attemptsAfterIncrement: number): number {
  const exp = Math.min(attemptsAfterIncrement, 20);
  return Math.min(1440, Math.pow(2, exp));
}

function isPermanentPreviewError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return PERMANENT_ERROR_PATTERNS.some((p) => msg.includes(p));
}

async function generateImagePreviews(original: Buffer): Promise<{ sm: Buffer; md: Buffer }> {
  const sm = await sharp(original)
    .rotate()
    .resize(160, 160, { fit: "inside" })
    .jpeg({ quality: 82 })
    .toBuffer();
  const md = await sharp(original)
    .rotate()
    .resize(400, 400, { fit: "inside" })
    .jpeg({ quality: 85 })
    .toBuffer();
  return { sm, md };
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
        dir = await mkdtemp(join(tmpdir(), "media-prev-v-"));
        const outPath = join(dir, "poster.jpg");
        const cmd: FfmpegCommand = ffmpeg(presignedUrl);
        const killTimer = setTimeout(() => {
          try {
            cmd.kill("SIGKILL");
          } catch {
            /* ignore */
          }
        }, FFMPEG_EXTRACT_TIMEOUT_MS);

        cmd
          .seekInput(seekSeconds)
          .outputOptions(["-frames:v", "1", "-q:v", "3"])
          .output(outPath)
          .on("end", async () => {
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
          .on("error", async (err) => {
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

async function videoPosterSmBuffer(s3Key: string): Promise<Buffer> {
  const url1 = await presignGetUrl(s3Key);
  let raw: Buffer;
  try {
    raw = await extractVideoPosterJpeg(url1, 1);
  } catch (e1) {
    logger.warn({ err: e1 }, "[mediaPreviewWorker] video poster @1s failed, retry @0");
    const url0 = await presignGetUrl(s3Key);
    raw = await extractVideoPosterJpeg(url0, 0);
  }
  return sharp(raw).rotate().resize(160, 160, { fit: "inside" }).jpeg({ quality: 82 }).toBuffer();
}

/**
 * Background worker: generate preview JPEGs in MinIO and set preview_status=ready.
 * Pattern: same cron + INTERNAL_JOB_SECRET as media-pending-delete purge.
 */
export async function processMediaPreviewBatch(limit: number = 10): Promise<ProcessMediaPreviewBatchResult> {
  const pool = getPool();
  const take = Math.max(1, Math.min(50, limit));
  let processed = 0;
  let errors = 0;

  for (let i = 0; i < take; i++) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query<{
        id: string;
        s3_key: string;
        mime_type: string;
        size_bytes: string;
        preview_attempts: number;
      }>(
        `SELECT id, s3_key, mime_type, size_bytes::text AS size_bytes, COALESCE(preview_attempts, 0)::int AS preview_attempts
         FROM media_files
         WHERE preview_status = 'pending'
           AND s3_key IS NOT NULL AND length(trim(s3_key)) > 0
           AND ${MEDIA_READABLE_STATUS_SQL}
           AND (preview_next_attempt_at IS NULL OR preview_next_attempt_at <= now())
         ORDER BY created_at ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED`,
      );

      if (rows.length === 0) {
        await client.query("COMMIT");
        break;
      }

      const row = rows[0]!;
      const mime = row.mime_type.toLowerCase();
      const sizeBytes = Number.parseInt(row.size_bytes, 10) || 0;
      const smKey = s3PreviewKey(row.id, "sm");
      const mdKey = s3PreviewKey(row.id, "md");

      try {
        if (mime === "image/heic" || mime === "image/heif") {
          await client.query(
            `UPDATE media_files SET preview_status = 'skipped', preview_next_attempt_at = NULL WHERE id = $1::uuid`,
            [row.id],
          );
          logger.info(
            { mediaId: row.id, mime },
            "[processMediaPreviewBatch] unsupported_preview_codec_heif, skipped",
          );
        } else if (mime.startsWith("image/") && sizeBytes > MAX_IMAGE_PREVIEW_BYTES) {
          await client.query(
            `UPDATE media_files SET preview_status = 'skipped', preview_next_attempt_at = NULL WHERE id = $1::uuid`,
            [row.id],
          );
          logger.info(
            { mediaId: row.id, sizeBytes, max: MAX_IMAGE_PREVIEW_BYTES },
            "[processMediaPreviewBatch] image too large for in-process preview, skipped",
          );
        } else if (mime.startsWith("video/") && sizeBytes > MAX_VIDEO_PREVIEW_BYTES) {
          await client.query(
            `UPDATE media_files SET preview_status = 'skipped', preview_next_attempt_at = NULL WHERE id = $1::uuid`,
            [row.id],
          );
          logger.info(
            { mediaId: row.id, sizeBytes, max: MAX_VIDEO_PREVIEW_BYTES },
            "[processMediaPreviewBatch] video too large for ffmpeg preview, skipped",
          );
        } else if (mime.startsWith("image/")) {
          const raw = await s3GetObjectBody(row.s3_key);
          if (!raw) {
            throw new Error("s3_get_object_empty");
          }
          const { sm, md } = await generateImagePreviews(raw);
          await s3PutObjectBody(smKey, sm, "image/jpeg");
          await s3PutObjectBody(mdKey, md, "image/jpeg");
          await client.query(
            `UPDATE media_files SET
               preview_status = 'ready',
               preview_sm_key = $2,
               preview_md_key = $3,
               preview_attempts = 0,
               preview_next_attempt_at = NULL
             WHERE id = $1::uuid`,
            [row.id, smKey, mdKey],
          );
        } else if (mime.startsWith("video/")) {
          const posterSm = await videoPosterSmBuffer(row.s3_key);
          await s3PutObjectBody(smKey, posterSm, "image/jpeg");
          await client.query(
            `UPDATE media_files SET
               preview_status = 'ready',
               preview_sm_key = $2,
               preview_md_key = NULL,
               preview_attempts = 0,
               preview_next_attempt_at = NULL
             WHERE id = $1::uuid`,
            [row.id, smKey],
          );
        } else {
          await client.query(
            `UPDATE media_files SET preview_status = 'skipped', preview_next_attempt_at = NULL WHERE id = $1::uuid`,
            [row.id],
          );
        }
      } catch (e) {
        if (isPermanentPreviewError(e)) {
          await client.query(
            `UPDATE media_files SET preview_status = 'skipped', preview_next_attempt_at = NULL WHERE id = $1::uuid`,
            [row.id],
          );
          logger.warn({ err: e, mediaId: row.id }, "[processMediaPreviewBatch] permanent error, skipped");
          await client.query("COMMIT");
          errors += 1;
          continue;
        }
        const prev = row.preview_attempts ?? 0;
        const nextAttempts = prev + 1;
        if (nextAttempts >= MAX_PREVIEW_ATTEMPTS) {
          await client.query(
            `UPDATE media_files SET
               preview_status = 'failed',
               preview_attempts = $2,
               preview_next_attempt_at = NULL
             WHERE id = $1::uuid`,
            [row.id, nextAttempts],
          );
        } else {
          const minutes = backoffMinutesAfterFailure(nextAttempts);
          await client.query(
            `UPDATE media_files SET
               preview_attempts = $2,
               preview_next_attempt_at = now() + ($3::numeric * interval '1 minute')
             WHERE id = $1::uuid`,
            [row.id, nextAttempts, minutes],
          );
        }
        await client.query("COMMIT");
        errors += 1;
        logger.error({ err: e, mediaId: row.id }, "[processMediaPreviewBatch] preview failed");
        continue;
      }

      await client.query("COMMIT");
      processed += 1;
    } catch (e) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
      throw e;
    } finally {
      client.release();
    }
  }

  return { processed, errors };
}
