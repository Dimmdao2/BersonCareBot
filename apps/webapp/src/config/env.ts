import "./loadEnv";
import { z } from "zod";

/** Repo-known defaults that must never be used in production or development. */
const INSECURE_SECRET_BLACKLIST = [
  "dev-session-secret-change-me-min-16",
  "dev-integrator-secret-change-me",
] as const;

const isTest = process.env.NODE_ENV === "test";

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
      process.env.NODE_ENV === "test" && process.env.USE_REAL_DATABASE !== "1" ? "" : val ?? ""
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
  TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
  /** Optional URL for MVP test video (e.g. /videos/test.mp4 or external). Webapp-owned; no integrator coupling. */
  MEDIA_TEST_VIDEO_URL: z.string().optional().default(""),
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
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  MEDIA_TEST_VIDEO_URL: process.env.MEDIA_TEST_VIDEO_URL ?? "",
});

export type EnvParsed = z.infer<typeof envSchema>;

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
