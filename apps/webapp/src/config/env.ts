import './loadEnv';
import { z } from 'zod';
import {
  assertDevAuthBypassConfiguration,
  parseDevAuthBypassFlag,
} from '@/modules/auth/devBypassPolicy';

/** Repo-known defaults that must never be used in production or development. */
const INSECURE_SECRET_BLACKLIST = [
  'dev-session-secret-change-me-min-16',
  'dev-integrator-secret-change-me',
] as const;

/** True in Vitest workers even when `.env.dev` sets `NODE_ENV=development` after dotenv. */
const isTest = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST_WORKER_ID);

/** `NODE_ENV === "test"` или Vitest worker; для выбора тестовых заглушек см. `webappReposAreInMemory`. */
export const isTestEnv = isTest;

/** Test-only defaults; never used in development or production. */
const TEST_DEFAULTS = {
  SESSION_COOKIE_SECRET: 'test-session-secret-16chars',
  INTEGRATOR_WEBAPP_ENTRY_SECRET: 'test-integrator-entry-secret',
  INTEGRATOR_WEBHOOK_SECRET: 'test-integrator-webhook-secret',
} as const;

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().positive().default(5200),
  APP_BASE_URL: z.string().url().default('http://127.0.0.1:5200'),
  /** In test env use "" unless USE_REAL_DATABASE=1 (then use .env / dev DB for e2e). */
  DATABASE_URL: z
    .string()
    .optional()
    .default('')
    .transform((val) => (isTest && process.env.USE_REAL_DATABASE !== '1' ? '' : (val ?? ''))),
  DB_PRINCIPAL_CONTEXT_MODE: z
    .enum(['legacy-guc', 'shadow', 'locked', 'port-context'])
    .optional()
    .default('legacy-guc'),
  DB_PRINCIPAL_SIGNING_SECRET: z
    .string()
    .optional()
    .transform((v) => (v ?? '').trim()),
  /** Target DB runtime: three physical webapp mTLS logins, never a generic fallback URL. */
  DATABASE_URL_STAFF: z.string().optional().transform((v) => (v ?? '').trim()),
  DATABASE_URL_PATIENT: z.string().optional().transform((v) => (v ?? '').trim()),
  DATABASE_URL_GLOBAL_ADMIN: z.string().optional().transform((v) => (v ?? '').trim()),
  WEBAPP_DB_STAFF_LOGIN: z.string().optional().transform((v) => (v ?? '').trim()),
  WEBAPP_DB_PATIENT_LOGIN: z.string().optional().transform((v) => (v ?? '').trim()),
  WEBAPP_DB_GLOBAL_ADMIN_LOGIN: z.string().optional().transform((v) => (v ?? '').trim()),
  WEBAPP_DB_TLS_CA_FILE: z.string().optional().transform((v) => (v ?? '').trim()),
  WEBAPP_DB_STAFF_CERT_FILE: z.string().optional().transform((v) => (v ?? '').trim()),
  WEBAPP_DB_STAFF_KEY_FILE: z.string().optional().transform((v) => (v ?? '').trim()),
  WEBAPP_DB_PATIENT_CERT_FILE: z.string().optional().transform((v) => (v ?? '').trim()),
  WEBAPP_DB_PATIENT_KEY_FILE: z.string().optional().transform((v) => (v ?? '').trim()),
  WEBAPP_DB_GLOBAL_ADMIN_CERT_FILE: z.string().optional().transform((v) => (v ?? '').trim()),
  WEBAPP_DB_GLOBAL_ADMIN_KEY_FILE: z.string().optional().transform((v) => (v ?? '').trim()),
  WEBAPP_PORT_CONTEXT_CAPABILITIES_JSON: z.string().optional().transform((v) => (v ?? '').trim()),
  /** Infrastructure key custody for U3S TOTP/recovery envelopes; parsed lazily by the typed crypto port. */
  STAFF_SECURITY_KEYRING_JSON: z.string().optional(),
  /** Required in production; in test uses safe default. In development must be set (no repo default). */
  SESSION_COOKIE_SECRET: z
    .string()
    .min(16)
    .optional()
    .transform((val) => (isTest ? (val ?? TEST_DEFAULTS.SESSION_COOKIE_SECRET) : (val ?? ''))),
  /** Optional fallback for entry/webhook when separate secrets not set; only for non-production. */
  INTEGRATOR_SHARED_SECRET: z.string().min(16).optional(),
  /** Base URL интегратора для вызова отправки SMS (POST /api/bersoncare/send-sms). Если не задан — используется заглушка. */
  INTEGRATOR_API_URL: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() ? v.trim() : '')),
  /** Secret for webapp-entry token (?t=...). Required in production; in test has default. */
  INTEGRATOR_WEBAPP_ENTRY_SECRET: z
    .string()
    .min(1)
    .optional()
    .transform((val) =>
      isTest ? (val ?? TEST_DEFAULTS.INTEGRATOR_WEBAPP_ENTRY_SECRET) : (val ?? ''),
    ),
  /** Secret for webhook HMAC. Required in production; in test has default. */
  INTEGRATOR_WEBHOOK_SECRET: z
    .string()
    .min(1)
    .optional()
    .transform((val) => (isTest ? (val ?? TEST_DEFAULTS.INTEGRATOR_WEBHOOK_SECRET) : (val ?? ''))),
  ALLOW_DEV_AUTH_BYPASS: z.string().optional().transform(parseDevAuthBypassFlag),
  /**
   * Opt-in dev aid: log the email-OTP code to the server console and tolerate
   * email send failure (no integrator running). Honored ONLY when
   * NODE_ENV === "development" (see emailAuth.ts). Default off — must never be
   * enabled on test/prod hosts (codes would land in journald).
   */
  DEV_EMAIL_OTP_DEBUG: z
    .string()
    .optional()
    .transform((value) => value === 'true'),
  /** Список через запятую: числовые Telegram user id людей (whitelist входа). Это не @username и не id бота. */
  ALLOWED_TELEGRAM_IDS: z.string().optional().default(''),
  /** Comma-separated MAX user ids allowed for webapp entry (when entry token has maxId). */
  ALLOWED_MAX_IDS: z.string().optional().default(''),
  /** Числовой Telegram user id админа (аккаунт человека), не username бота. */
  ADMIN_TELEGRAM_ID: z.coerce.number().int().optional(),
  /** Список через запятую: числовые Telegram user id врачей (люди), не username бота. */
  DOCTOR_TELEGRAM_IDS: z.string().optional().default(''),
  /** Comma-separated Max user ids treated as admin (role resolution + whitelist). */
  ADMIN_MAX_IDS: z.string().optional().default(''),
  /** Comma-separated Max user ids treated as doctor (role resolution + whitelist). */
  DOCTOR_MAX_IDS: z.string().optional().default(''),
  /** Comma-separated phone numbers (any format); normalized match → admin. */
  ADMIN_PHONES: z.string().optional().default(''),
  /** Comma-separated phone numbers → doctor. */
  DOCTOR_PHONES: z.string().optional().default(''),
  /** Comma-separated phone numbers allowed for client-only entry (token / phone flow whitelist). */
  ALLOWED_PHONES: z.string().optional().default(''),
  /**
   * C-4 (2026-07-26, docs/ARCHITECTURE/ADMIN_ACCESS_MODEL.md): the ONE identity pinned as the
   * platform owner, in an environment variable — outside the application's own settings, the same
   * way Django's `createsuperuser`, AWS root, and Auth0's provider console are provisioned. Both
   * `envRole.ts:isVerifiedEmailGlobalAdminAsync` (the fresh, per-session admin elevation check) and
   * `instrumentation.ts:ensurePlatformOwnerAdminRole` (the idempotent `platform_users.role='admin'`
   * assertion that replaces the literal address migration `0233_global_admin_hard_role.sql` hardcoded)
   * read only this value — never the DB-resident `admin_emails` allowlist.
   * Deliberately named by ROLE, not by identifier type: today it is compared as a normalized e-mail,
   * but a pending legal question (taskdb #1034/#1035) may force a Russian phone number or ЕСИА id —
   * that switch is a value change here, not a rename or a rebuild.
   */
  PLATFORM_OWNER_IDENTITY: z
    .string()
    .optional()
    .transform((v) => (v ?? '').trim()),
  TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
  /** Optional URL for MVP test video (e.g. /videos/test.mp4 or external). Webapp-owned; no integrator coupling. */
  MEDIA_TEST_VIDEO_URL: z.string().optional().default(''),
  /** Directory for uploaded CMS media files (disk). Empty → `var/media` under cwd. */
  MEDIA_STORAGE_DIR: z.string().optional().default(''),
  /** MinIO / S3 API endpoint (e.g. https://fs.example.com). Empty → disk-only media port. */
  S3_ENDPOINT: z
    .string()
    .optional()
    .transform((v) => (v ?? '').trim()),
  S3_ACCESS_KEY: z
    .string()
    .optional()
    .transform((v) => (v ?? '').trim()),
  S3_SECRET_KEY: z
    .string()
    .optional()
    .transform((v) => (v ?? '').trim()),
  S3_PUBLIC_BUCKET: z
    .string()
    .optional()
    .transform((v) => (v ?? '').trim()),
  /** CMS / intake media objects (presign PUT, GetObject). Required when S3 media is enabled. */
  S3_PRIVATE_BUCKET: z
    .string()
    .optional()
    .transform((v) => (v ?? '').trim()),
  S3_REGION: z
    .string()
    .optional()
    .transform((v) => (v ?? '').trim() || 'us-east-1'),
  S3_FORCE_PATH_STYLE: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  /**
   * Публичный username бота без `@` (как в `t.me/<username>`), для fallback deep link / Login Widget.
   * Не путать с числовым id бота из BotFather и с `ALLOWED_TELEGRAM_IDS` / `ADMIN_TELEGRAM_ID` (это id пользователей).
   */
  TELEGRAM_BOT_USERNAME: z.string().min(1).default('bersoncare_bot'),
  /** Bearer token for POST /api/internal/* cron-style jobs. Empty → purge route returns 503. */
  INTERNAL_JOB_SECRET: z
    .string()
    .optional()
    .transform((v) => (v ?? '').trim()),
  /**
   * ВНЕШНИЙ приёмник dead man's switch (design D-d). Пульс, который излучает наша же
   * мёртвая коробка, ничего не доказывает, поэтому в проде здесь обязан стоять адрес
   * СТОРОННЕГО сервиса. Пусто → пульс только пишется локально (и локально же проверяется).
   */
  OPERATOR_HEARTBEAT_PIPELINE_URL: z
    .string()
    .optional()
    .transform((v) => (v ?? '').trim()),
  OPERATOR_HEARTBEAT_DIGEST_URL: z
    .string()
    .optional()
    .transform((v) => (v ?? '').trim()),
  /** Pino log level (e.g. info, warn, error). */
  LOG_LEVEL: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() ? v.trim() : 'info')),
  /** Optional path to system ffmpeg binary (overrides @ffmpeg-installer path). */
  FFMPEG_PATH: z
    .string()
    .optional()
    .transform((v) => (v ?? '').trim()),
  /** Optional path to ImageMagick binary (`magick`/`convert`) for HEIC fallback. */
  MAGICK_PATH: z
    .string()
    .optional()
    .transform((v) => (v ?? '').trim()),
});

const parsed = envSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  HOST: process.env.HOST,
  PORT: process.env.PORT,
  APP_BASE_URL: process.env.APP_BASE_URL,
  DATABASE_URL: process.env.DATABASE_URL,
  DB_PRINCIPAL_CONTEXT_MODE: process.env.DB_PRINCIPAL_CONTEXT_MODE,
  DB_PRINCIPAL_SIGNING_SECRET: process.env.DB_PRINCIPAL_SIGNING_SECRET,
  DATABASE_URL_STAFF: process.env.DATABASE_URL_STAFF,
  DATABASE_URL_PATIENT: process.env.DATABASE_URL_PATIENT,
  DATABASE_URL_GLOBAL_ADMIN: process.env.DATABASE_URL_GLOBAL_ADMIN,
  WEBAPP_DB_STAFF_LOGIN: process.env.WEBAPP_DB_STAFF_LOGIN,
  WEBAPP_DB_PATIENT_LOGIN: process.env.WEBAPP_DB_PATIENT_LOGIN,
  WEBAPP_DB_GLOBAL_ADMIN_LOGIN: process.env.WEBAPP_DB_GLOBAL_ADMIN_LOGIN,
  WEBAPP_DB_TLS_CA_FILE: process.env.WEBAPP_DB_TLS_CA_FILE,
  WEBAPP_DB_STAFF_CERT_FILE: process.env.WEBAPP_DB_STAFF_CERT_FILE,
  WEBAPP_DB_STAFF_KEY_FILE: process.env.WEBAPP_DB_STAFF_KEY_FILE,
  WEBAPP_DB_PATIENT_CERT_FILE: process.env.WEBAPP_DB_PATIENT_CERT_FILE,
  WEBAPP_DB_PATIENT_KEY_FILE: process.env.WEBAPP_DB_PATIENT_KEY_FILE,
  WEBAPP_DB_GLOBAL_ADMIN_CERT_FILE: process.env.WEBAPP_DB_GLOBAL_ADMIN_CERT_FILE,
  WEBAPP_DB_GLOBAL_ADMIN_KEY_FILE: process.env.WEBAPP_DB_GLOBAL_ADMIN_KEY_FILE,
  WEBAPP_PORT_CONTEXT_CAPABILITIES_JSON: process.env.WEBAPP_PORT_CONTEXT_CAPABILITIES_JSON,
  STAFF_SECURITY_KEYRING_JSON: process.env.STAFF_SECURITY_KEYRING_JSON,
  SESSION_COOKIE_SECRET: process.env.SESSION_COOKIE_SECRET,
  INTEGRATOR_SHARED_SECRET: process.env.INTEGRATOR_SHARED_SECRET,
  INTEGRATOR_API_URL: process.env.INTEGRATOR_API_URL ?? '',
  INTEGRATOR_WEBAPP_ENTRY_SECRET: process.env.INTEGRATOR_WEBAPP_ENTRY_SECRET,
  INTEGRATOR_WEBHOOK_SECRET: process.env.INTEGRATOR_WEBHOOK_SECRET,
  ALLOW_DEV_AUTH_BYPASS: process.env.ALLOW_DEV_AUTH_BYPASS,
  DEV_EMAIL_OTP_DEBUG: process.env.DEV_EMAIL_OTP_DEBUG,
  ALLOWED_TELEGRAM_IDS: process.env.ALLOWED_TELEGRAM_IDS,
  ALLOWED_MAX_IDS: process.env.ALLOWED_MAX_IDS,
  ADMIN_TELEGRAM_ID: process.env.ADMIN_TELEGRAM_ID,
  DOCTOR_TELEGRAM_IDS: process.env.DOCTOR_TELEGRAM_IDS,
  ADMIN_MAX_IDS: process.env.ADMIN_MAX_IDS,
  DOCTOR_MAX_IDS: process.env.DOCTOR_MAX_IDS,
  ADMIN_PHONES: process.env.ADMIN_PHONES,
  DOCTOR_PHONES: process.env.DOCTOR_PHONES,
  ALLOWED_PHONES: process.env.ALLOWED_PHONES,
  PLATFORM_OWNER_IDENTITY: process.env.PLATFORM_OWNER_IDENTITY,
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  MEDIA_TEST_VIDEO_URL: process.env.MEDIA_TEST_VIDEO_URL ?? '',
  MEDIA_STORAGE_DIR: process.env.MEDIA_STORAGE_DIR ?? '',
  S3_ENDPOINT: process.env.S3_ENDPOINT,
  S3_ACCESS_KEY: process.env.S3_ACCESS_KEY,
  S3_SECRET_KEY: process.env.S3_SECRET_KEY,
  S3_PUBLIC_BUCKET: process.env.S3_PUBLIC_BUCKET,
  S3_PRIVATE_BUCKET: process.env.S3_PRIVATE_BUCKET,
  S3_REGION: process.env.S3_REGION,
  S3_FORCE_PATH_STYLE: process.env.S3_FORCE_PATH_STYLE,
  TELEGRAM_BOT_USERNAME: process.env.TELEGRAM_BOT_USERNAME?.trim() || 'bersoncare_bot',
  INTERNAL_JOB_SECRET: process.env.INTERNAL_JOB_SECRET,
  OPERATOR_HEARTBEAT_PIPELINE_URL: process.env.OPERATOR_HEARTBEAT_PIPELINE_URL,
  OPERATOR_HEARTBEAT_DIGEST_URL: process.env.OPERATOR_HEARTBEAT_DIGEST_URL,
  LOG_LEVEL: process.env.LOG_LEVEL,
  FFMPEG_PATH: process.env.FFMPEG_PATH,
  MAGICK_PATH: process.env.MAGICK_PATH,
});

assertDevAuthBypassConfiguration({
  nodeEnv: parsed.NODE_ENV,
  allowDevAuthBypass: parsed.ALLOW_DEV_AUTH_BYPASS,
});

export type EnvParsed = z.infer<typeof envSchema>;

/** CMS media: S3 presign + PutObject when endpoint, keys, and private bucket are set. */
export function isS3MediaEnabled(e: EnvParsed): boolean {
  return Boolean(e.S3_ENDPOINT && e.S3_ACCESS_KEY && e.S3_SECRET_KEY && e.S3_PRIVATE_BUCKET);
}

/** Throws if any secret matches repo-known insecure value. No-op when isTest. Used at startup and in tests. */
export function checkInsecureSecretsForStartup(env: EnvParsed, isTestEnv: boolean): void {
  if (isTestEnv) return;
  const session = env.SESSION_COOKIE_SECRET ?? '';
  const entry = env.INTEGRATOR_WEBAPP_ENTRY_SECRET ?? env.INTEGRATOR_SHARED_SECRET ?? '';
  const webhook = env.INTEGRATOR_WEBHOOK_SECRET ?? env.INTEGRATOR_SHARED_SECRET ?? '';
  for (const bad of INSECURE_SECRET_BLACKLIST) {
    if (session === bad || entry === bad || webhook === bad) {
      throw new Error(
        `Refusing to start: secret matches repo-known insecure value. Set real secrets in env (e.g. SESSION_COOKIE_SECRET, INTEGRATOR_WEBAPP_ENTRY_SECRET, INTEGRATOR_WEBHOOK_SECRET).`,
      );
    }
  }
}

function rejectInsecureSecrets(env: z.infer<typeof envSchema>): void {
  checkInsecureSecretsForStartup(env, isTest);
}

/** Next.js sets this during `next build`; skip env checks then so build works without production secrets. */
const isNextBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';

if (!isNextBuildPhase) {
  if (parsed.NODE_ENV === 'production') {
    if (!parsed.SESSION_COOKIE_SECRET || parsed.SESSION_COOKIE_SECRET.length < 16) {
      throw new Error('Production requires SESSION_COOKIE_SECRET (min 16 chars) in env.');
    }
    const entrySecret = parsed.INTEGRATOR_WEBAPP_ENTRY_SECRET || parsed.INTEGRATOR_SHARED_SECRET;
    const webhookSecret = parsed.INTEGRATOR_WEBHOOK_SECRET || parsed.INTEGRATOR_SHARED_SECRET;
    if (!entrySecret || entrySecret.length < 16) {
      throw new Error(
        'Production requires INTEGRATOR_WEBAPP_ENTRY_SECRET or INTEGRATOR_SHARED_SECRET in env.',
      );
    }
    if (!webhookSecret || webhookSecret.length < 16) {
      throw new Error(
        'Production requires INTEGRATOR_WEBHOOK_SECRET or INTEGRATOR_SHARED_SECRET in env.',
      );
    }
    if ((parsed.DATABASE_URL ?? '').trim() && !isS3MediaEnabled(parsed)) {
      throw new Error(
        'Production with DATABASE_URL requires CMS media in MinIO/S3: set S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY, and S3_PRIVATE_BUCKET (see SERVER CONVENTIONS).',
      );
    }
  } else {
    if (!isTest) {
      if (!parsed.SESSION_COOKIE_SECRET || parsed.SESSION_COOKIE_SECRET.length < 16) {
        throw new Error(
          'Development requires SESSION_COOKIE_SECRET (min 16 chars) in env. Use .env or .env.local.',
        );
      }
      const entrySecret = parsed.INTEGRATOR_WEBAPP_ENTRY_SECRET || parsed.INTEGRATOR_SHARED_SECRET;
      const webhookSecret = parsed.INTEGRATOR_WEBHOOK_SECRET || parsed.INTEGRATOR_SHARED_SECRET;
      if (!entrySecret || !webhookSecret) {
        throw new Error(
          'Development requires integrator secrets: set INTEGRATOR_WEBAPP_ENTRY_SECRET and INTEGRATOR_WEBHOOK_SECRET, or INTEGRATOR_SHARED_SECRET, in env.',
        );
      }
    }
  }
}

rejectInsecureSecrets(parsed);

if (
  (parsed.DB_PRINCIPAL_CONTEXT_MODE === 'shadow' ||
    parsed.DB_PRINCIPAL_CONTEXT_MODE === 'locked') &&
  !parsed.DB_PRINCIPAL_SIGNING_SECRET
) {
  throw new Error(
    `DB_PRINCIPAL_SIGNING_SECRET is required when DB_PRINCIPAL_CONTEXT_MODE=${parsed.DB_PRINCIPAL_CONTEXT_MODE}.`,
  );
}

export const env = parsed;

type WebappDatabaseRuntimeEnv = Pick<
  typeof env,
  | 'DB_PRINCIPAL_CONTEXT_MODE'
  | 'DATABASE_URL'
  | 'DATABASE_URL_STAFF'
  | 'DATABASE_URL_PATIENT'
  | 'DATABASE_URL_GLOBAL_ADMIN'
>;

/** True when the selected runtime mode has every physical DB pool it requires. */
export function webappRuntimeDatabaseIsConfigured(input: WebappDatabaseRuntimeEnv = env): boolean {
  return input.DB_PRINCIPAL_CONTEXT_MODE === 'port-context'
    ? Boolean((input.DATABASE_URL_STAFF ?? '').trim() && (input.DATABASE_URL_PATIENT ?? '').trim())
      && Boolean((input.DATABASE_URL_GLOBAL_ADMIN ?? '').trim())
    : Boolean((input.DATABASE_URL ?? '').trim());
}

/** Dev-bypass login must not repair identity data through read-only runtime topologies. */
export function devBypassDatabaseIdentityIsReadOnly(
  input: Pick<WebappDatabaseRuntimeEnv, 'DB_PRINCIPAL_CONTEXT_MODE'> = env,
): boolean {
  return (
    input.DB_PRINCIPAL_CONTEXT_MODE === 'locked'
    || input.DB_PRINCIPAL_CONTEXT_MODE === 'port-context'
  );
}

/**
 * In-memory репозитории: Vitest без БД, либо `next build` без `DATABASE_URL` (CI).
 * `next dev` без URL — ошибка; production runtime без URL — см. `instrumentation.ts` и `getPool()`.
 */
export function webappReposAreInMemory(): boolean {
  const runtimeDatabaseConfigured = webappRuntimeDatabaseIsConfigured();
  if (runtimeDatabaseConfigured) return false;
  if (isTest) return true;
  if (process.env.NODE_ENV === 'development') {
    throw new Error(
      env.DB_PRINCIPAL_CONTEXT_MODE === 'port-context'
        ? 'DATABASE_URL_STAFF, DATABASE_URL_PATIENT and DATABASE_URL_GLOBAL_ADMIN are required in webapp port-context mode.'
        : 'DATABASE_URL is not set. Configure the webapp PostgreSQL URL (e.g. apps/webapp/.env.dev or .env.local).',
    );
  }
  return true;
}

export const isProduction = parsed.NODE_ENV === 'production';

/** Secret used to sign/verify webapp-entry token. */
export const integratorWebappEntrySecret = (): string =>
  env.INTEGRATOR_WEBAPP_ENTRY_SECRET ||
  env.INTEGRATOR_SHARED_SECRET ||
  (isTest ? TEST_DEFAULTS.INTEGRATOR_WEBAPP_ENTRY_SECRET : '');

/** Secret used for webhook HMAC. */
export const integratorWebhookSecret = (): string =>
  env.INTEGRATOR_WEBHOOK_SECRET ||
  env.INTEGRATOR_SHARED_SECRET ||
  (isTest ? TEST_DEFAULTS.INTEGRATOR_WEBHOOK_SECRET : '');
