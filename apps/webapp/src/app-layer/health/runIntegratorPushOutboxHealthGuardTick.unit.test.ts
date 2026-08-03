import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  read: vi.fn(async () => ({ pendingCount: 0, failedCount: 0, oldestPendingAgeMinutes: null })),
  purgeArchive: vi.fn(async () => ({ deleted: 0 })),
  purgeWebhook: vi.fn(async () => ({ deleted: 0 })),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: vi.fn(() => ({
    operatorHealthRead: { getIntegratorPushOutboxHealth: mocks.read },
    healthFailureArchive: { purgeExpired: mocks.purgeArchive },
    operatorHealthWrite: { purgeIntegrationWebhookErrorEventsOlderThanHours: mocks.purgeWebhook },
  })),
}));
vi.mock('@/app-layer/logging/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));
vi.mock('@/modules/operator-health/integratorPushOutboxHealth', () => ({
  classifyIntegratorPushOutboxSystemHealthStatus: vi.fn(() => 'ok'),
}));

import { runIntegratorPushOutboxHealthGuardTick } from './runIntegratorPushOutboxHealthGuardTick';

describe('runIntegratorPushOutboxHealthGuardTick overlap', () => {
  it('keeps classification and both idempotent maintenance purges when cron and signed wake overlap', async () => {
    const results = await Promise.all([
      runIntegratorPushOutboxHealthGuardTick(),
      runIntegratorPushOutboxHealthGuardTick(),
    ]);
    expect(results).toEqual([
      { status: 'ok', alerted: false },
      { status: 'ok', alerted: false },
    ]);
    expect(mocks.read).toHaveBeenCalledTimes(2);
    expect(mocks.purgeArchive).toHaveBeenCalledTimes(2);
    expect(mocks.purgeWebhook).toHaveBeenCalledTimes(2);
  });
});
