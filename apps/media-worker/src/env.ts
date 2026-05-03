import { config } from "dotenv";
import { createRequire } from "node:module";
import { hostname } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/** Load repo-style `.env.dev` from webapp when present (local dev). */
function loadDotenv() {
  config({ path: join(__dirname, "../../webapp/.env.dev") });
  config();
}

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  POLL_MS: z.coerce.number().int().positive().default(5000),
  STALE_LOCK_MINUTES: z.coerce.number().int().positive().default(30),
  MAX_TRANSCODE_ATTEMPTS: z.coerce.number().int().positive().default(5),
  FFMPEG_TIMEOUT_MS: z.coerce.number().int().positive().default(7200000),
  LOG_LEVEL: z.string().optional().default("info"),
  FFMPEG_PATH: z.string().optional().transform((v) => (v ?? "").trim()),
  MEDIA_WORKER_LOCK_ID: z.string().optional().transform((v) => (v ?? "").trim()),
  S3_ENDPOINT: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_PRIVATE_BUCKET: z.string().min(1),
  S3_REGION: z.string().optional().default("us-east-1"),
  S3_FORCE_PATH_STYLE: z
    .string()
    .optional()
    .transform((v) => v === "true"),
});

export type MediaWorkerEnv = z.infer<typeof schema> & {
  ffmpegPathResolved: string;
  lockId: string;
};

export function loadMediaWorkerEnv(): MediaWorkerEnv {
  loadDotenv();
  const parsed = schema.parse({
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    POLL_MS: process.env.MEDIA_WORKER_POLL_MS ?? process.env.POLL_MS,
    STALE_LOCK_MINUTES: process.env.MEDIA_WORKER_STALE_LOCK_MINUTES,
    MAX_TRANSCODE_ATTEMPTS: process.env.MEDIA_WORKER_MAX_ATTEMPTS,
    FFMPEG_TIMEOUT_MS: process.env.MEDIA_WORKER_FFMPEG_TIMEOUT_MS,
    LOG_LEVEL: process.env.LOG_LEVEL,
    FFMPEG_PATH: process.env.FFMPEG_PATH,
    MEDIA_WORKER_LOCK_ID: process.env.MEDIA_WORKER_LOCK_ID,
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    S3_ACCESS_KEY: process.env.S3_ACCESS_KEY,
    S3_SECRET_KEY: process.env.S3_SECRET_KEY,
    S3_PRIVATE_BUCKET: process.env.S3_PRIVATE_BUCKET,
    S3_REGION: process.env.S3_REGION,
    S3_FORCE_PATH_STYLE: process.env.S3_FORCE_PATH_STYLE,
  });
  const ffmpegPathResolved =
    parsed.FFMPEG_PATH || (require("@ffmpeg-installer/ffmpeg").path as string);
  const lockId = parsed.MEDIA_WORKER_LOCK_ID || `${hostname()}-${process.pid}`;
  return { ...parsed, ffmpegPathResolved, lockId };
}
