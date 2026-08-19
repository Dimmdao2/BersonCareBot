import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Единственный вопрос этого файла: письмо, которое реально уходит через
 * `dispatchOperatorAlert`, несёт метку окружения В ТЕМЕ. Убери `stampOperatorAlertSubject`
 * из чокпоинта (`pushTitle`) — этот тест краснеет первым.
 */

vi.mock('@/config/env', () => ({ env: { APP_BASE_URL: 'https://test.bersoncare.ru' } }));
vi.mock('@/infra/logging/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/modules/system-settings/configAdapter', () => ({
  getConfigValue: vi.fn(async () => ''),
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

describe('dispatchOperatorAlert — env label reaches the real email subject', () => {
  beforeEach(() => {
    relayCalls.length = 0;
    registerAdminNotificationTargetsPort({
      loadTargets: async () => ({
        telegram: [],
        max: [],
        sms: [],
        email: ['operator@example.com'],
      }),
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
