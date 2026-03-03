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
  BOT_TOKEN: process.env.BOT_TOKEN ?? 'test-bot-token',
  ADMIN_TELEGRAM_ID: process.env.ADMIN_TELEGRAM_ID ?? '1',
  INBOX_CHAT_ID: process.env.INBOX_CHAT_ID ?? '1',
  BOOKING_URL: process.env.BOOKING_URL ?? 'https://example.com',
  DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://localhost:5432/test',
  RUBITIME_WEBHOOK_TOKEN: process.env.RUBITIME_WEBHOOK_TOKEN ?? 'test-rubitime-token',
});
