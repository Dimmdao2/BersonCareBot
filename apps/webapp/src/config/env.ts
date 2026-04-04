import "./loadEnv";
import { z } from "zod";

/** Repo-known defaults that must never be used in production or development. */
const INSECURE_SECRET_BLACKLIST = [
  "dev-session-secret-change-me-min-16",
  "dev-integrator-secret-change-me",
] as const;

/** True in Vitest workers even when `.env.dev` sets `NODE_ENV=development` after dotenv. */
const isTest =
  process.env.NODE_ENV === "test" || Boolean(process.env.VITEST_WORKER_ID);

/** Test-only defaults; never used in development or production. */
const TEST_DEFAULTS = {
  SESSION_COOKIE_SECRET: "test-session-secret-16chars",
  INTEGRATOR_WEBAPP_ENTRY_SECRET: "test-integrator-entry-secret",
  INTEGRATOR_WEBHOOK_SECRET: "test-integrator-webhook-secret",
} as const;

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().positive().default(5200),
  APP_BASE_URL: z.string().url().default("http://127.0.0.1:5200"),
  /** In test env use "" unless USE_REAL_DATABASE=1 (then use .env / dev DB for e2e). */
  DATABASE_URL: z
    .string()
    .optional()
    .default("")
    .transform((val) =>
      isTest && process.env.USE_REAL_DATABASE !== "1" ? "" : val ?? ""
    ),
  /** Required in production; in test uses safe default. In development must be set (no repo default). */
  SESSION_COOKIE_SECRET: z
    .string()
    .min(16)
    .optional()
    .transform((val) =>
      isTest ? val ?? TEST_DEFAULTS.SESSION_COOKIE_SECRET : (val ?? "")
    ),
  /** Optional fallback for entry/webhook when separate secrets not set; only for non-production. */
  INTEGRATOR_SHARED_SECRET: z.string().min(16).optional(),
  /** Base URL интегратора для вызова отправки SMS (POST /api/bersoncare/send-sms). Если не задан — используется заглушка. */
  INTEGRATOR_API_URL: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() ? v.trim() : "")),
  /** Secret for webapp-entry token (?t=...). Required in production; in test has default. */
  INTEGRATOR_WEBAPP_ENTRY_SECRET: z
    .string()
    .min(1)
    .optional()
    .transform((val) =>
      isTest ? val ?? TEST_DEFAULTS.INTEGRATOR_WEBAPP_ENTRY_SECRET : val ?? ""
    ),
  /** Secret for webhook HMAC. Required in production; in test has default. */
  INTEGRATOR_WEBHOOK_SECRET: z
    .string()
    .min(1)
    .optional()
    .transform((val) =>
      isTest ? val ?? TEST_DEFAULTS.INTEGRATOR_WEBHOOK_SECRET : val ?? ""
    ),
  ALLOW_DEV_AUTH_BYPASS: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  ALLOWED_TELEGRAM_IDS: z.string().optional().default(""),
  /** Comma-separated MAX user ids allowed for webapp entry (when entry token has maxId). */
  ALLOWED_MAX_IDS: z.string().optional().default(""),
  ADMIN_TELEGRAM_ID: z.coerce.number().int().optional(),
  DOCTOR_TELEGRAM_IDS: z.string().optional().default(""),
  /** Comma-separated Max user ids treated as admin (role resolution + whitelist). */
  ADMIN_MAX_IDS: z.string().optional().default(""),
  /** Comma-separated Max user ids treated as doctor (role resolution + whitelist). */
  DOCTOR_MAX_IDS: z.string().optional().default(""),
  /** Comma-separated phone numbers (any format); normalized match → admin. */
  ADMIN_PHONES: z.string().optional().default(""),
  /** Comma-separated phone numbers → doctor. */
  DOCTOR_PHONES: z.string().optional().default(""),
  /** Comma-separated phone numbers allowed for client-only entry (token / phone flow whitelist). */
  ALLOWED_PHONES: z.string().optional().default(""),
  TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
  /** Optional URL for MVP test video (e.g. /videos/test.mp4 or external). Webapp-owned; no integrator coupling. */
  MEDIA_TEST_VIDEO_URL: z.string().optional().default(""),
  /** Directory for uploaded CMS media files (disk). Empty → `var/media` under cwd. */
  MEDIA_STORAGE_DIR: z.string().optional().default(""),
  /** MinIO / S3 API endpoint (e.g. https://fs.example.com). Empty → disk-only media port. */
  S3_ENDPOINT: z
    .string()
    .optional()
    .transform((v) => (v ?? "").trim()),
  S3_ACCESS_KEY: z
    .string()
    .optional()
    .transform((v) => (v ?? "").trim()),
  S3_SECRET_KEY: z
    .string()
    .optional()
    .transform((v) => (v ?? "").trim()),
  S3_PUBLIC_BUCKET: z
    .string()
    .optional()
    .transform((v) => (v ?? "").trim()),
  S3_REGION: z
    .string()
    .optional()
    .transform((v) => ((v ?? "").trim() || "us-east-1")),
  S3_FORCE_PATH_STYLE: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  /** Имя Telegram-бота без @ для deep-link t.me/… (привязка канала). */
  TELEGRAM_BOT_USERNAME: z.string().min(1).default("bersoncare_bot"),
  /** Яндекс OAuth (этап 5). Пусто — режим отключён. */
  YANDEX_OAUTH_CLIENT_ID: z.string().optional().default(""),
  YANDEX_OAUTH_CLIENT_SECRET: z.string().optional().default(""),
  YANDEX_OAUTH_REDIRECT_URI: z.string().optional().default(""),
});

const parsed = envSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  HOST: process.env.HOST,
  PORT: process.env.PORT,
  APP_BASE_URL: process.env.APP_BASE_URL,
  DATABASE_URL: process.env.DATABASE_URL,
  SESSION_COOKIE_SECRET: process.env.SESSION_COOKIE_SECRET,
  INTEGRATOR_SHARED_SECRET: process.env.INTEGRATOR_SHARED_SECRET,
  INTEGRATOR_API_URL: process.env.INTEGRATOR_API_URL ?? "",
  INTEGRATOR_WEBAPP_ENTRY_SECRET: process.env.INTEGRATOR_WEBAPP_ENTRY_SECRET,
  INTEGRATOR_WEBHOOK_SECRET: process.env.INTEGRATOR_WEBHOOK_SECRET,
  ALLOW_DEV_AUTH_BYPASS: process.env.ALLOW_DEV_AUTH_BYPASS,
  ALLOWED_TELEGRAM_IDS: process.env.ALLOWED_TELEGRAM_IDS,
  ALLOWED_MAX_IDS: process.env.ALLOWED_MAX_IDS,
  ADMIN_TELEGRAM_ID: process.env.ADMIN_TELEGRAM_ID,
  DOCTOR_TELEGRAM_IDS: process.env.DOCTOR_TELEGRAM_IDS,
  ADMIN_MAX_IDS: process.env.ADMIN_MAX_IDS,
  DOCTOR_MAX_IDS: process.env.DOCTOR_MAX_IDS,
  ADMIN_PHONES: process.env.ADMIN_PHONES,
  DOCTOR_PHONES: process.env.DOCTOR_PHONES,
  ALLOWED_PHONES: process.env.ALLOWED_PHONES,
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  MEDIA_TEST_VIDEO_URL: process.env.MEDIA_TEST_VIDEO_URL ?? "",
  MEDIA_STORAGE_DIR: process.env.MEDIA_STORAGE_DIR ?? "",
  S3_ENDPOINT: process.env.S3_ENDPOINT,
  S3_ACCESS_KEY: process.env.S3_ACCESS_KEY,
  S3_SECRET_KEY: process.env.S3_SECRET_KEY,
  S3_PUBLIC_BUCKET: process.env.S3_PUBLIC_BUCKET,
  S3_REGION: process.env.S3_REGION,
  S3_FORCE_PATH_STYLE: process.env.S3_FORCE_PATH_STYLE,
  TELEGRAM_BOT_USERNAME: process.env.TELEGRAM_BOT_USERNAME?.trim() || "bersoncare_bot",
  YANDEX_OAUTH_CLIENT_ID: process.env.YANDEX_OAUTH_CLIENT_ID,
  YANDEX_OAUTH_CLIENT_SECRET: process.env.YANDEX_OAUTH_CLIENT_SECRET,
  YANDEX_OAUTH_REDIRECT_URI: process.env.YANDEX_OAUTH_REDIRECT_URI,
});

export type EnvParsed = z.infer<typeof envSchema>;

/** CMS media: S3 presign + PutObject when all required S3 env vars are set. */
export function isS3MediaEnabled(e: EnvParsed): boolean {
  return Boolean(
    e.S3_ENDPOINT && e.S3_ACCESS_KEY && e.S3_SECRET_KEY && e.S3_PUBLIC_BUCKET,
  );
}

/** Throws if any secret matches repo-known insecure value. No-op when isTest. Used at startup and in tests. */
export function checkInsecureSecretsForStartup(env: EnvParsed, isTestEnv: boolean): void {
  if (isTestEnv) return;
  const session = env.SESSION_COOKIE_SECRET ?? "";
  const entry = env.INTEGRATOR_WEBAPP_ENTRY_SECRET ?? env.INTEGRATOR_SHARED_SECRET ?? "";
  const webhook = env.INTEGRATOR_WEBHOOK_SECRET ?? env.INTEGRATOR_SHARED_SECRET ?? "";
  for (const bad of INSECURE_SECRET_BLACKLIST) {
    if (session === bad || entry === bad || webhook === bad) {
      throw new Error(
        `Refusing to start: secret matches repo-known insecure value. Set real secrets in env (e.g. SESSION_COOKIE_SECRET, INTEGRATOR_WEBAPP_ENTRY_SECRET, INTEGRATOR_WEBHOOK_SECRET).`
      );
    }
  }
}

function rejectInsecureSecrets(env: z.infer<typeof envSchema>): void {
  checkInsecureSecretsForStartup(env, isTest);
}

/** Next.js sets this during `next build`; skip env checks then so build works without production secrets. */
const isNextBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

if (!isNextBuildPhase) {
  if (parsed.NODE_ENV === "production") {
    if (!parsed.SESSION_COOKIE_SECRET || parsed.SESSION_COOKIE_SECRET.length < 16) {
      throw new Error("Production requires SESSION_COOKIE_SECRET (min 16 chars) in env.");
    }
    const entrySecret = parsed.INTEGRATOR_WEBAPP_ENTRY_SECRET || parsed.INTEGRATOR_SHARED_SECRET;
    const webhookSecret = parsed.INTEGRATOR_WEBHOOK_SECRET || parsed.INTEGRATOR_SHARED_SECRET;
    if (!entrySecret || entrySecret.length < 16) {
      throw new Error("Production requires INTEGRATOR_WEBAPP_ENTRY_SECRET or INTEGRATOR_SHARED_SECRET in env.");
    }
    if (!webhookSecret || webhookSecret.length < 16) {
      throw new Error("Production requires INTEGRATOR_WEBHOOK_SECRET or INTEGRATOR_SHARED_SECRET in env.");
    }
  } else {
    if (!isTest) {
      if (!parsed.SESSION_COOKIE_SECRET || parsed.SESSION_COOKIE_SECRET.length < 16) {
        throw new Error(
          "Development requires SESSION_COOKIE_SECRET (min 16 chars) in env. Use .env or .env.local."
        );
      }
      const entrySecret = parsed.INTEGRATOR_WEBAPP_ENTRY_SECRET || parsed.INTEGRATOR_SHARED_SECRET;
      const webhookSecret = parsed.INTEGRATOR_WEBHOOK_SECRET || parsed.INTEGRATOR_SHARED_SECRET;
      if (!entrySecret || !webhookSecret) {
        throw new Error(
          "Development requires integrator secrets: set INTEGRATOR_WEBAPP_ENTRY_SECRET and INTEGRATOR_WEBHOOK_SECRET, or INTEGRATOR_SHARED_SECRET, in env."
        );
      }
    }
  }
}

rejectInsecureSecrets(parsed);

export const env = parsed;

export const isProduction = parsed.NODE_ENV === "production";

/** Secret used to sign/verify webapp-entry token. */
export const integratorWebappEntrySecret = (): string =>
  env.INTEGRATOR_WEBAPP_ENTRY_SECRET ||
  env.INTEGRATOR_SHARED_SECRET ||
  (isTest ? TEST_DEFAULTS.INTEGRATOR_WEBAPP_ENTRY_SECRET : "");

/** Secret used for webhook HMAC. */
export const integratorWebhookSecret = (): string =>
  env.INTEGRATOR_WEBHOOK_SECRET ||
  env.INTEGRATOR_SHARED_SECRET ||
  (isTest ? TEST_DEFAULTS.INTEGRATOR_WEBHOOK_SECRET : "");
