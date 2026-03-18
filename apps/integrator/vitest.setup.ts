/**
 * Runs before all tests. Load .env so on dev (with real DB) tests use real DATABASE_URL etc.
 * Then set fallbacks only for vars still missing (e.g. in CI).
 */
import dotenv from 'dotenv';

process.env.DOTENV_CONFIG_QUIET = 'true';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'silent';
dotenv.config({ quiet: true });

Object.assign(process.env, {
  BOOKING_URL: process.env.BOOKING_URL ?? 'https://example.com',
  DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://localhost:5432/test',
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN ?? 'test-bot-token',
  TELEGRAM_ADMIN_ID: process.env.TELEGRAM_ADMIN_ID ?? '364943522',
  RUBITIME_API_KEY: process.env.RUBITIME_API_KEY ?? 'test-rubitime-api-key',
  RUBITIME_WEBHOOK_TOKEN: process.env.RUBITIME_WEBHOOK_TOKEN ?? 'test-rubitime-webhook-token',
  SMSC_API_KEY: process.env.SMSC_API_KEY ?? 'test-smsc-api-key',
  SMSC_BASE_URL: process.env.SMSC_BASE_URL ?? 'https://smsc.ru/sys/send.php',
});
