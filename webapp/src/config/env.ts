import "./loadEnv";
import { z } from "zod";

const buildDefaults = {
  DATABASE_URL: "postgres://localhost:5432/bcb_webapp_dev",
  SESSION_COOKIE_SECRET: "dev-session-secret-change-me-min-16",
  INTEGRATOR_SHARED_SECRET: "dev-integrator-secret-change-me",
};

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().positive().default(5200),
  APP_BASE_URL: z.string().url().default("http://127.0.0.1:5200"),
  DATABASE_URL: z.string().min(1).default(buildDefaults.DATABASE_URL),
  SESSION_COOKIE_SECRET: z.string().min(16).default(buildDefaults.SESSION_COOKIE_SECRET),
  /** Used for both entry and webhook if INTEGRATOR_WEBAPP_ENTRY_SECRET / INTEGRATOR_WEBHOOK_SECRET are not set. */
  INTEGRATOR_SHARED_SECRET: z.string().min(16).default(buildDefaults.INTEGRATOR_SHARED_SECRET),
  /** Secret for signing/verifying webapp-entry token (?t=...). If unset, INTEGRATOR_SHARED_SECRET is used. */
  INTEGRATOR_WEBAPP_ENTRY_SECRET: z.string().min(1).optional(),
  /** Secret for webhook HMAC (X-Bersoncare-Signature). If unset, INTEGRATOR_SHARED_SECRET is used. */
  INTEGRATOR_WEBHOOK_SECRET: z.string().min(1).optional(),
  /** In production, dev tokens are never accepted regardless of this value. */
  ALLOW_DEV_AUTH_BYPASS: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  ALLOWED_TELEGRAM_IDS: z.string().optional().default(""),
  ADMIN_TELEGRAM_ID: z.coerce.number().int().optional(),
  /** Bot token for validating Telegram Web App initData (only for auth, not for API calls). */
  TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
});

export const env = envSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  HOST: process.env.HOST,
  PORT: process.env.PORT,
  APP_BASE_URL: process.env.APP_BASE_URL,
  DATABASE_URL: process.env.DATABASE_URL,
  SESSION_COOKIE_SECRET: process.env.SESSION_COOKIE_SECRET,
  INTEGRATOR_SHARED_SECRET: process.env.INTEGRATOR_SHARED_SECRET,
  INTEGRATOR_WEBAPP_ENTRY_SECRET: process.env.INTEGRATOR_WEBAPP_ENTRY_SECRET,
  INTEGRATOR_WEBHOOK_SECRET: process.env.INTEGRATOR_WEBHOOK_SECRET,
  ALLOW_DEV_AUTH_BYPASS: process.env.ALLOW_DEV_AUTH_BYPASS,
  ALLOWED_TELEGRAM_IDS: process.env.ALLOWED_TELEGRAM_IDS,
  ADMIN_TELEGRAM_ID: process.env.ADMIN_TELEGRAM_ID,
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
});

export const isProduction = env.NODE_ENV === "production";

/** Secret used to sign/verify webapp-entry token. Falls back to INTEGRATOR_SHARED_SECRET. */
export const integratorWebappEntrySecret = (): string =>
  env.INTEGRATOR_WEBAPP_ENTRY_SECRET ?? env.INTEGRATOR_SHARED_SECRET;

/** Secret used for webhook HMAC. Falls back to INTEGRATOR_SHARED_SECRET. */
export const integratorWebhookSecret = (): string =>
  env.INTEGRATOR_WEBHOOK_SECRET ?? env.INTEGRATOR_SHARED_SECRET;
