import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const counter = vi.fn();
  const fallbackRelay = vi.fn();
  const reportEmptyAudience = vi.fn(async (event: unknown) => {
    counter(event);
    fallbackRelay(event);
    return { counterTotal: 1, fallback: 'sent' as const };
  });

  return {
    counter,
    fallbackRelay,
    reportEmptyAudience,
    heartbeat: vi.fn(async () => undefined),
    standardRelay: vi.fn(async () => ({ ok: true as const, status: 'accepted' as const })),
  };
});

vi.mock('@/app-layer/health/tickProjectionDigestDebounce', () => ({
  tickProjectionDigestDebounce: vi.fn(async () => undefined),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: vi.fn(() => ({
    operatorHealthDigestRead: {
      hadOperatorIncidentsResolveAllInWindow: vi.fn(async () => false),
    },
  })),
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
  getAppDisplayTimeZone: vi.fn(async () => 'UTC'),
}));

vi.mock('@/modules/system-settings/configAdapter', () => ({
  getConfigValue: vi.fn(async (key: string) =>
    key === 'operator_health_alert_config'
      ? JSON.stringify({
          topics: { digest_enabled: true },
          digestTime: '09:00',
          channels: {
            digest: {
              telegram: true,
              max: true,
              web_push: true,
              sms: true,
              email: true,
            },
          },
        })
      : '',
  ),
}));

vi.mock('@/modules/operator-alerts/operatorAlertRuntime', () => ({
  getOperatorAlertDedupPort: vi.fn(() => null),
}));

vi.mock('@/modules/operator-alerts/adminNotificationTargetsRuntime', () => ({
  getAdminNotificationTargetsPort: vi.fn(() => ({
    loadTargets: vi.fn(async () => ({
      telegram: [],
      max: [],
      sms: [],
      email: [],
    })),
  })),
}));

vi.mock('@/modules/admin-incidents/adminIncidentStaffPushRuntime', () => ({
  getAdminIncidentStaffPushDeps: vi.fn(() => null),
}));

vi.mock('@/modules/admin-incidents/sendAdminIncidentStaffWebPush', () => ({
  sendAdminIncidentStaffWebPush: vi.fn(async () => 0),
}));

vi.mock('@/modules/operator-alerts/relayOperatorAlert', () => ({
  relayOperatorAlert: mocks.standardRelay,
}));

vi.mock('@/app-layer/operator-alerts/reportEmptyNotificationAudience', () => ({
  reportEmptyNotificationAudience: mocks.reportEmptyAudience,
}));

vi.mock('@/app-layer/operator-health/pingOperatorHeartbeat', () => ({
  pingOperatorHeartbeatBestEffort: mocks.heartbeat,
}));

vi.mock('@/infra/logging/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

import {
  registerEmptyAudienceReporter,
  resetEmptyAudienceReporterForTests,
} from '@/modules/operator-alerts/emptyAudienceRuntime';
import { runOperatorHealthDigestTick } from './runOperatorHealthDigestTick';

describe('runOperatorHealthDigestTick empty-audience seam', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registerEmptyAudienceReporter(async (event) => {
      await mocks.reportEmptyAudience(event);
    });
  });

  afterEach(() => {
    resetEmptyAudienceReporterForTests();
  });

  it('counts and relays an empty digest audience exactly once through the dispatcher', async () => {
    const result = await runOperatorHealthDigestTick(new Date('2026-07-30T09:00:00.000Z'));

    expect(result).toMatchObject({ sent: false, reason: 'no_recipients' });
    expect(result.dedupKey).toBeTruthy();
    expect(mocks.reportEmptyAudience).toHaveBeenCalledOnce();
    expect(mocks.counter).toHaveBeenCalledOnce();
    expect(mocks.fallbackRelay).toHaveBeenCalledOnce();
    expect(mocks.standardRelay).not.toHaveBeenCalled();
    expect(mocks.heartbeat).not.toHaveBeenCalled();
  });
});
