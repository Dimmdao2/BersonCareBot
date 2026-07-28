import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUrl = vi.hoisted(() => vi.fn());
const getSecret = vi.hoisted(() => vi.fn());
vi.mock('@/modules/system-settings/integrationRuntime', () => ({
  getIntegratorApiUrl: getUrl,
  getIntegratorWebhookSecret: getSecret,
}));

import { relayOperatorAlert } from './relayOperatorAlert';

describe('relayOperatorAlert', () => {
  beforeEach(() => {
    getUrl.mockResolvedValue('http://integrator.test');
    getSecret.mockResolvedValue('test-shared-secret');
  });

  it('passes a bounded abort signal to the dedicated relay', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return new Response(JSON.stringify({ ok: true, status: 'accepted' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;
    await expect(
      relayOperatorAlert(
        {
          messageId: 'incident:1:initial',
          channel: 'telegram',
          recipient: '42',
          text: 'alert',
        },
        { fetchImpl, timeoutMs: 25 },
      ),
    ).resolves.toEqual({ ok: true, status: 'accepted' });
  });

  it('returns a deterministic failure when the relay aborts', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValue(new DOMException('timed out', 'TimeoutError')) as typeof fetch;
    await expect(
      relayOperatorAlert(
        {
          messageId: 'incident:1:initial',
          channel: 'max',
          recipient: '43',
          text: 'alert',
        },
        { fetchImpl, timeoutMs: 1 },
      ),
    ).resolves.toEqual({ ok: false, reason: 'timed out' });
  });
});
