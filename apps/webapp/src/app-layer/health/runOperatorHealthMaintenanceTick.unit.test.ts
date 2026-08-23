import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  purgeArchive: vi.fn(async () => ({ deleted: 0 })),
  purgeWebhook: vi.fn(async () => ({ deleted: 0 })),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: vi.fn(() => ({
    healthFailureArchive: { purgeExpired: mocks.purgeArchive },
    operatorHealthWrite: { purgeIntegrationWebhookErrorEventsOlderThanHours: mocks.purgeWebhook },
  })),
}));
vi.mock('@/app-layer/logging/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));

import { runOperatorHealthMaintenanceTick } from './runOperatorHealthMaintenanceTick';

describe('runOperatorHealthMaintenanceTick overlap', () => {
  it('keeps both idempotent maintenance purges when cron and signed wake overlap', async () => {
    await Promise.all([
      runOperatorHealthMaintenanceTick(),
      runOperatorHealthMaintenanceTick(),
    ]);
    expect(mocks.purgeArchive).toHaveBeenCalledTimes(2);
    expect(mocks.purgeWebhook).toHaveBeenCalledTimes(2);
  });
});
