import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  digestTime: '09:00',
  timeZone: 'Europe/Berlin',
  rows: new Set<string>(),
  enqueue: vi.fn(async (deliveries: readonly { eventId: string }[]) => {
    let inserted = 0;
    for (const delivery of deliveries) {
      if (!mocks.rows.has(delivery.eventId)) {
        mocks.rows.add(delivery.eventId);
        inserted += 1;
      }
    }
    return inserted;
  }),
  heartbeat: vi.fn(async () => undefined),
}));

vi.mock('@/app-layer/health/collectOperatorHealthDigestInput', () => ({
  collectOperatorHealthDigestInput: vi.fn(async () => ({})),
}));
vi.mock('@/modules/operator-health/buildOperatorHealthDigest', () => ({
  buildOperatorHealthDigest: vi.fn(() => ({
    icon: '✅',
    hasIssues: false,
    lines: ['Всё в порядке'],
  })),
}));
vi.mock('@/modules/system-settings/appDisplayTimezone', () => ({
  getAppDisplayTimeZone: vi.fn(async () => mocks.timeZone),
}));
vi.mock('@/modules/system-settings/configAdapter', () => ({
  getConfigValue: vi.fn(async (key: string) =>
    key === 'operator_health_alert_config'
      ? JSON.stringify({
          topics: { digest_enabled: true },
          digestTime: mocks.digestTime,
          channels: {
            digest: { telegram: true, max: false, web_push: false, sms: false, email: false },
          },
        })
      : '',
  ),
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: vi.fn(() => ({
    operatorHealthDigestRead: { hadOperatorIncidentsResolveAllInWindow: vi.fn(async () => false) },
    operatorHealthDigestDelivery: {
      loadRecipients: vi.fn(async () => ({
        telegram: ['123'],
        max: [],
        sms: [],
        email: [],
        web_push: [],
      })),
      enqueue: mocks.enqueue,
      loadLatestSentAt: vi.fn(async () => null),
    },
  })),
}));
vi.mock('@/app-layer/operator-health/pingOperatorHeartbeat', () => ({
  pingOperatorHeartbeatBestEffort: mocks.heartbeat,
}));

import { runOperatorHealthDigestTick } from './runOperatorHealthDigestTick';

describe('runOperatorHealthDigestTick queue materialization', () => {
  beforeEach(() => {
    mocks.digestTime = '09:00';
    mocks.timeZone = 'Europe/Berlin';
    mocks.rows.clear();
    vi.clearAllMocks();
  });

  it('uses the configured local slot across DST and converges concurrent old/new triggers', async () => {
    const now = new Date('2026-03-29T07:00:00.000Z'); // 09:00 after Europe/Berlin DST jump
    const [oldCron, signedWake] = await Promise.all([
      runOperatorHealthDigestTick(now),
      runOperatorHealthDigestTick(now),
    ]);
    expect([oldCron.sent, signedWake.sent].sort()).toEqual([false, true]);
    expect(mocks.rows.size).toBe(1);
    expect(mocks.enqueue).toHaveBeenCalledTimes(2);
    expect(mocks.heartbeat).toHaveBeenCalledOnce();
  });

  it('moves the next materialization immediately when digestTime changes', async () => {
    mocks.digestTime = '10:00';
    expect(await runOperatorHealthDigestTick(new Date('2026-04-01T07:00:00.000Z'))).toMatchObject({
      sent: false,
      reason: 'not_slot',
    });
    expect(mocks.rows.size).toBe(0);
    expect(await runOperatorHealthDigestTick(new Date('2026-04-01T08:00:00.000Z'))).toMatchObject({
      sent: true,
    });
    expect(mocks.rows.size).toBe(1);
  });
});
