import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Поведение общей точки отправки операторских алертов: тема окружения и пустая аудитория. */

vi.mock('@/config/env', () => ({ env: { APP_BASE_URL: 'https://test.bersoncare.ru' } }));
vi.mock('@/infra/logging/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/modules/system-settings/configAdapter', () => ({
  getConfigValue: vi.fn(async () => ''),
}));
vi.mock('./emptyAudienceRuntime', () => ({
  reportEmptyAudience: vi.fn(async () => undefined),
}));

const relayCalls: Array<{ channel: string; recipient: string; metadata?: Record<string, unknown> }> =
  [];
vi.mock('./relayOperatorAlert', () => ({
  relayOperatorAlert: vi.fn(async (input: Record<string, unknown>) => {
    relayCalls.push({
      channel: input.channel as string,
      recipient: input.recipient as string,
      metadata: input.metadata as Record<string, unknown> | undefined,
    });
    return { ok: true, status: 'accepted' };
  }),
}));

import { dispatchOperatorAlert } from './dispatchOperatorAlert';
import { registerAdminNotificationTargetsPort } from './adminNotificationTargetsRuntime';
import { reportEmptyAudience } from './emptyAudienceRuntime';

describe('dispatchOperatorAlert', () => {
  beforeEach(() => {
    relayCalls.length = 0;
    vi.mocked(reportEmptyAudience).mockClear();
    registerAdminNotificationTargetsPort({
      loadTargets: async () => ({
        telegram: [],
        max: [],
        sms: [],
        email: ['operator@example.com'],
      }),
    });
  });

  it('does not feed an undeliverable empty-audience signal back into its own counter', async () => {
    registerAdminNotificationTargetsPort({
      loadTargets: async () => ({ telegram: [], max: [], sms: [], email: [] }),
    });

    const result = await dispatchOperatorAlert({
      block: 'critical',
      topic: 'notification_audience_empty',
      dedupKey: 'critical:notification_audience_empty:active',
      lines: ['Уведомлению некому уйти'],
    });

    expect(result).toEqual({ dispatched: false, reason: 'no_recipients' });
    expect(reportEmptyAudience).not.toHaveBeenCalled();
  });

  it('still records an empty audience for other operator alerts', async () => {
    registerAdminNotificationTargetsPort({
      loadTargets: async () => ({ telegram: [], max: [], sms: [], email: [] }),
    });

    await dispatchOperatorAlert({
      block: 'critical',
      topic: 'integrator_api',
      dedupKey: 'critical:integrator_api:unreachable',
      lines: ['Integrator API: unreachable'],
    });

    expect(reportEmptyAudience).toHaveBeenCalledWith({
      topic: 'operator_alert:integrator_api',
      severity: 'operational',
      channels: expect.any(Array),
      context: { block: 'critical' },
    });
  });

  it('stamps the [TEST] label onto the email subject, text after it intact', async () => {
    const result = await dispatchOperatorAlert({
      block: 'critical',
      topic: 'hls_transcode_queue',
      dedupKey: 'hls_transcode_queue:envlabel-test',
      lines: ['Очередь транскода HLS: error'],
      pushTitle: 'Очередь транскода HLS: error',
    });

    expect(result.dispatched).toBe(true);
    const emailCall = relayCalls.find((c) => c.channel === 'email');
    expect(emailCall?.metadata?.subject).toBe('[TEST] Очередь транскода HLS: error');
  });
});
