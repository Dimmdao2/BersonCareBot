/**
 * Unit tests for webPushAccessPort (PLAN S13 Model β).
 *
 * Verifies the integrator can fetch `{ subscriptions[], vapid }` for a user ref
 * via stubbed webapp GET responses. No real network calls, no DB.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../config/env.js', () => ({
  env: { APP_BASE_URL: 'https://webapp.test' },
  integratorWebhookSecret: () => 'test-secret-16chars!!',
}));

import { createWebPushAccessPort } from './webPushAccessPort.js';

const STUB_SUBSCRIPTION = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/stub-ep',
  expirationTime: null,
  keys: { p256dh: 'p256dh-abc', auth: 'auth-xyz' },
};

const STUB_VAPID = {
  publicKey: 'pub-key',
  privateKey: 'priv-key',
  subject: 'mailto:admin@example.com',
};

const originalFetch = globalThis.fetch;

describe('webPushAccessPort', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let port: ReturnType<typeof createWebPushAccessPort>;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as typeof fetch;
    port = createWebPushAccessPort({
      getAppBaseUrl: async () => 'https://webapp.test',
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // --- getSubscriptionsForUser ---

  describe('getSubscriptionsForUser', () => {
    it('returns subscriptions for a user on happy path', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, subscriptions: [STUB_SUBSCRIPTION] }),
      });

      const result = await port.getSubscriptionsForUser('user-uuid-123');
      expect(result).toHaveLength(1);
      expect(result![0]!.endpoint).toBe(STUB_SUBSCRIPTION.endpoint);
      expect(result![0]!.keys.p256dh).toBe(STUB_SUBSCRIPTION.keys.p256dh);
      expect(result![0]!.keys.auth).toBe(STUB_SUBSCRIPTION.keys.auth);
    });

    it('calls correct URL with userId query param', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, subscriptions: [] }),
      });

      await port.getSubscriptionsForUser('specific-user-id');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url] = fetchMock.mock.calls[0]!;
      expect(url).toContain('/api/integrator/web-push/subscriptions');
      expect(url).toContain('userId=specific-user-id');
    });

    it('returns empty array when user has no subscriptions', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, subscriptions: [] }),
      });

      const result = await port.getSubscriptionsForUser('user-no-subs');
      expect(result).toEqual([]);
    });

    it('returns null when webapp returns non-ok HTTP', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ ok: false, error: 'invalid signature' }),
      });

      const result = await port.getSubscriptionsForUser('user-uuid');
      expect(result).toBeNull();
    });

    it('returns null when ok:false in response body', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: false, error: 'some error' }),
      });

      const result = await port.getSubscriptionsForUser('user-uuid');
      expect(result).toBeNull();
    });

    it('returns null when fetch throws (network error)', async () => {
      fetchMock.mockRejectedValueOnce(new Error('network error'));
      const result = await port.getSubscriptionsForUser('user-uuid');
      expect(result).toBeNull();
    });

    it('filters out malformed subscriptions from response', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          subscriptions: [
            STUB_SUBSCRIPTION,
            { endpoint: 'https://example.com', expirationTime: null },    // missing keys
            { keys: { p256dh: 'x', auth: 'y' } },                        // missing endpoint
            null,                                                          // null
            'not-an-object',                                              // string
          ],
        }),
      });

      const result = await port.getSubscriptionsForUser('user-uuid');
      // Only the first valid subscription passes
      expect(result).toHaveLength(1);
      expect(result![0]!.endpoint).toBe(STUB_SUBSCRIPTION.endpoint);
    });

    it('includes HMAC auth headers in request', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, subscriptions: [] }),
      });

      await port.getSubscriptionsForUser('user-uuid');
      const [, options] = fetchMock.mock.calls[0]!;
      const headers = (options as RequestInit).headers as Record<string, string>;
      expect(headers['X-Bersoncare-Timestamp']).toBeDefined();
      expect(headers['X-Bersoncare-Signature']).toBeDefined();
    });
  });

  // --- getVapidCredentials ---

  describe('getVapidCredentials', () => {
    it('returns vapid credentials on happy path', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, vapid: STUB_VAPID }),
      });

      const result = await port.getVapidCredentials();
      expect(result).toMatchObject({
        publicKey: STUB_VAPID.publicKey,
        privateKey: STUB_VAPID.privateKey,
        subject: STUB_VAPID.subject,
      });
    });

    it('calls correct URL with no query params', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, vapid: STUB_VAPID }),
      });

      await port.getVapidCredentials();
      const [url] = fetchMock.mock.calls[0]!;
      expect(url).toContain('/api/integrator/web-push/vapid');
      // no query params for vapid
      expect(url).not.toContain('?');
    });

    it('returns null when VAPID not configured (503 from webapp)', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ ok: false, error: 'web_push_vapid not configured' }),
      });

      const result = await port.getVapidCredentials();
      expect(result).toBeNull();
    });

    it('returns null when vapid object is missing from response', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      });

      const result = await port.getVapidCredentials();
      expect(result).toBeNull();
    });

    it('returns null when privateKey missing from vapid object', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, vapid: { publicKey: 'pub', subject: 'mailto:x@x.com' } }),
      });

      const result = await port.getVapidCredentials();
      expect(result).toBeNull();
    });

    it('returns null on fetch error', async () => {
      fetchMock.mockRejectedValueOnce(new Error('connection refused'));
      const result = await port.getVapidCredentials();
      expect(result).toBeNull();
    });

    it('includes HMAC auth headers in request', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, vapid: STUB_VAPID }),
      });

      await port.getVapidCredentials();
      const [, options] = fetchMock.mock.calls[0]!;
      const headers = (options as RequestInit).headers as Record<string, string>;
      expect(headers['X-Bersoncare-Timestamp']).toBeDefined();
      expect(headers['X-Bersoncare-Signature']).toBeDefined();
    });
  });

  // --- Combined: integrator can fetch both subscriptions and vapid for a user ---

  describe('combined fetch (subscriptions + vapid) for a pushUserId', () => {
    it('fetches subscriptions and vapid independently, can be called together', async () => {
      // First call: subscriptions; second call: vapid
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ ok: true, subscriptions: [STUB_SUBSCRIPTION] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ ok: true, vapid: STUB_VAPID }),
        });

      const [subs, vapid] = await Promise.all([
        port.getSubscriptionsForUser('user-123'),
        port.getVapidCredentials(),
      ]);

      expect(subs).toHaveLength(1);
      expect(vapid).toMatchObject({
        publicKey: STUB_VAPID.publicKey,
        privateKey: STUB_VAPID.privateKey,
        subject: STUB_VAPID.subject,
      });
    });
  });
});
