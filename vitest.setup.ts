/**
 * Runs before all tests. Sets minimal env so config/env.ts parse succeeds when app is imported.
 */
Object.assign(process.env, {
  BOT_TOKEN: process.env.BOT_TOKEN ?? 'test-bot-token',
  ADMIN_TELEGRAM_ID: process.env.ADMIN_TELEGRAM_ID ?? '1',
  INBOX_CHAT_ID: process.env.INBOX_CHAT_ID ?? '1',
  BOOKING_URL: process.env.BOOKING_URL ?? 'https://example.com',
  DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://localhost:5432/test',
});
