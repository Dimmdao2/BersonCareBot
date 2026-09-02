import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../config/env.js', () => ({
  integratorWebhookSecret: () => 'test-webhook-secret',
}));

import { createWebPushAccessPort } from './webPushAccessPort.js';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const PUSH_USER_ID = '22222222-2222-4222-8222-222222222222';

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('web-push M2M access fails closed before the provider', () => {
  it('preserves a genuine empty subscription list as an empty list', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      jsonResponse({ ok: true, subscriptions: [] }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const port = createWebPushAccessPort({ getAppBaseUrl: async () => 'https://webapp.test' });

    await expect(port.getSubscriptionsForUser(PUSH_USER_ID, ORGANIZATION_ID)).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('turns runtime configuration rejection into a typed pre-provider failure', async () => {
    const port = createWebPushAccessPort({
      getAppBaseUrl: async () => {
        throw new Error('settings DB unavailable');
      },
    });

    await expect(port.getSubscriptionsForUser(PUSH_USER_ID, ORGANIZATION_ID)).rejects.toThrow(
      'WEB_PUSH_ACCESS_UNAVAILABLE:runtime_config',
    );
  });

  it('turns network failure into a typed pre-provider failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () => {
        throw new Error('connect ECONNREFUSED');
      }),
    );
    const port = createWebPushAccessPort({ getAppBaseUrl: async () => 'https://webapp.test' });

    await expect(port.getSubscriptionsForUser(PUSH_USER_ID, ORGANIZATION_ID)).rejects.toThrow(
      'WEB_PUSH_ACCESS_UNAVAILABLE:network',
    );
  });

  it.each([
    ['auth', 401],
    ['DB/runtime', 503],
  ])('turns %s HTTP failure into a typed pre-provider failure', async (_kind, status) => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () => jsonResponse({ ok: false }, status)),
    );
    const port = createWebPushAccessPort({ getAppBaseUrl: async () => 'https://webapp.test' });

    await expect(port.getSubscriptionsForUser(PUSH_USER_ID, ORGANIZATION_ID)).rejects.toThrow(
      `WEB_PUSH_ACCESS_UNAVAILABLE:http_${status}`,
    );
  });

  it('rejects a malformed successful response instead of filtering it into an empty audience', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () =>
        jsonResponse({ ok: true, subscriptions: [{ endpoint: 'https://push.test/no-keys' }] }),
      ),
    );
    const port = createWebPushAccessPort({ getAppBaseUrl: async () => 'https://webapp.test' });

    await expect(port.getSubscriptionsForUser(PUSH_USER_ID, ORGANIZATION_ID)).rejects.toThrow(
      'WEB_PUSH_ACCESS_UNAVAILABLE:invalid_response',
    );
  });
});
