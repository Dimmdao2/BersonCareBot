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
  INTEGRATOR_SHARED_SECRET: z.string().min(16).default(buildDefaults.INTEGRATOR_SHARED_SECRET),
  ALLOW_DEV_AUTH_BYPASS: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  ALLOWED_TELEGRAM_IDS: z.string().optional().default(""),
  ADMIN_TELEGRAM_ID: z.coerce.number().int().optional(),
});

export const env = envSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  HOST: process.env.HOST,
  PORT: process.env.PORT,
  APP_BASE_URL: process.env.APP_BASE_URL,
  DATABASE_URL: process.env.DATABASE_URL,
  SESSION_COOKIE_SECRET: process.env.SESSION_COOKIE_SECRET,
  INTEGRATOR_SHARED_SECRET: process.env.INTEGRATOR_SHARED_SECRET,
  ALLOW_DEV_AUTH_BYPASS: process.env.ALLOW_DEV_AUTH_BYPASS,
  ALLOWED_TELEGRAM_IDS: process.env.ALLOWED_TELEGRAM_IDS,
  ADMIN_TELEGRAM_ID: process.env.ADMIN_TELEGRAM_ID,
});

export const isProduction = env.NODE_ENV === "production";
