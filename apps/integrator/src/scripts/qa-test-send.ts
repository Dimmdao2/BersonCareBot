/** Owner-authorized TEST-only proof through the final delivery gate. */
import '../config/loadEnv.js';
import { parseTestFlag, readTestAccountIdentifiers } from '../shared/testDeliverySafety.js';
import { buildDeps } from '../app/di.js';
import { logger } from '../infra/observability/logger.js';
import type { OutgoingIntent } from '../kernel/contracts/index.js';

async function main(): Promise<void> {
  // ── SAFETY GATE ────────────────────────────────────────────────────────────
  if (!parseTestFlag(process.env.TEST)) {
    logger.error('ABORT: TEST is not true — this proof is allowed only on TEST.');
    process.exit(2);
  }
  const testAccounts = readTestAccountIdentifiers();
  const telegramChatId = [...testAccounts.telegramIds][0];
  const webPushUserId = [...testAccounts.webPushUserIds][0];
  if (!telegramChatId || !webPushUserId) {
    logger.error('ABORT: TEST_ACCOUNT_TELEGRAM_IDS and TEST_ACCOUNT_WEB_PUSH_USER_IDS are required.');
    process.exit(2);
  }

  const deps = buildDeps();
  const now = new Date().toISOString();
  const stamp = Date.now();

  const telegram: OutgoingIntent = {
    type: 'message.send',
    meta: {
      eventId: `qa-test-tg:${stamp}`,
      occurredAt: now,
      source: 'telegram',
      correlationId: `qa-test-${stamp}`,
    },
    payload: {
      recipient: { chatId: telegramChatId },
      message: {
        text: `🧪 TEST — проверка прямой доставки разрешённому тестовому аккаунту.\n${now}`,
      },
      delivery: { channels: ['telegram'] },
    },
  };

  const webPush: OutgoingIntent = {
    type: 'message.send',
    meta: {
      eventId: `qa-test-wp:${stamp}`,
      occurredAt: now,
      source: 'web_push',
      correlationId: `qa-test-${stamp}`,
    },
    payload: {
      recipient: { pushUserId: webPushUserId },
      message: { text: `🧪 TEST — проверка прямой доставки тестовому аккаунту. ${now}` },
      title: 'TEST — проверка доставки',
      url: '/app/patient',
      delivery: { channels: ['web_push'] },
    },
  };

  for (const [label, intent] of [
    ['telegram', telegram],
    ['web_push', webPush],
  ] as const) {
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
