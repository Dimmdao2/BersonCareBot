/**
 * QA TEST-SEND (owner-authorized, dev-only). Sends ONE telegram message + ONE web_push to FAKE
 * recipients through the integrator dispatchPort. The pre-fork dev redirect collapses both to the
 * test user «Дмитрий Берсон». DOUBLE-SAFE: (1) hard abort unless the redirect is ACTIVE; (2) the
 * original recipients are FAKE ids, so even a redirect miss can only hit a non-existent chat/user.
 * Run: cd apps/integrator && NODE_ENV=development npx tsx src/scripts/qa-test-send.ts
 */
import '../config/loadEnv.js';
import { isDevRedirectActive, getDevRedirectTargets } from '../shared/devDeliveryRedirect.js';
import { buildDeps } from '../app/di.js';
import { logger } from '../infra/observability/logger.js';
import type { OutgoingIntent } from '../kernel/contracts/index.js';

async function main(): Promise<void> {
  // ── SAFETY GATE ────────────────────────────────────────────────────────────
  if (process.env.NODE_ENV === 'production') {
    logger.error('ABORT: NODE_ENV=production — no test sends in production.');
    process.exit(2);
  }
  if (!isDevRedirectActive()) {
    logger.error('ABORT: dev delivery redirect is NOT active — refusing to send (would risk a real client).');
    process.exit(2);
  }
  const targets = getDevRedirectTargets();
  logger.warn(
    { NODE_ENV: process.env.NODE_ENV, targets },
    'QA test-send: redirect ACTIVE — every send collapses to the test user (Дмитрий). Proceeding.',
  );

  const deps = buildDeps();
  const now = new Date().toISOString();
  const stamp = Date.now();

  const telegram: OutgoingIntent = {
    type: 'message.send',
    meta: { eventId: `qa-test-tg:${stamp}`, occurredAt: now, source: 'telegram', correlationId: `qa-test-${stamp}` },
    payload: {
      recipient: { chatId: 700000001 }, // FAKE → redirect collapses to Дмитрий's telegram
      message: { text: `🧪 BersonCare DEV — тест-отправка (Telegram).\nЕсли видишь это — редирект на тебя работает.\n${now}` },
      delivery: { channels: ['telegram'] },
    },
  };

  const webPush: OutgoingIntent = {
    type: 'message.send',
    meta: { eventId: `qa-test-wp:${stamp}`, occurredAt: now, source: 'web_push', correlationId: `qa-test-${stamp}` },
    payload: {
      recipient: { pushUserId: 'fa9e0000-0000-4000-8000-790000000000' }, // FAKE QA user → redirect → Дмитрий's pushUserId
      message: { text: `🧪 BersonCare DEV — тест-пуш. Редирект на тебя работает. ${now}` },
      title: 'BersonCare — тест-рассылка',
      url: '/app/patient',
      delivery: { channels: ['web_push'] },
    },
  };

  for (const [label, intent] of [['telegram', telegram], ['web_push', webPush]] as const) {
    try {
      const result = await deps.dispatchPort.dispatchOutgoing(intent);
      logger.warn({ channel: label, result }, `QA test-send: ${label} dispatched`);
    } catch (err) {
      logger.error({ channel: label, err }, `QA test-send: ${label} FAILED`);
    }
  }

  process.exit(0);
}

const hardTimeout = setTimeout(() => {
  logger.error('QA test-send: hard timeout (60s) — exiting.');
  process.exit(3);
}, 60_000);
hardTimeout.unref();

void main();
