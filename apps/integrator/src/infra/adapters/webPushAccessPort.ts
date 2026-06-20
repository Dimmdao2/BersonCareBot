// eslint-disable-next-line no-secrets/no-secrets -- JSDoc identifiers, not secrets
/**
 * Integrator read port for web-push subscriptions + VAPID (PLAN S13 Model β).
 *
 * The integrator M2M-reads webapp active subscriptions and VAPID credentials at send time.
 * No mirror table, no schema change (N3 = Model β, approved 2026-06-17).
 *
 * Pattern: mirrors `deliveryTargetsPort.ts` / `webappEventsClient.fetchSignedGet` sign contract.
 * VAPID private key crossing M2M is acceptable per N3: already server-side in system_settings.
 *
 * Extended in S14 to add `deleteSubscriptionByEndpoint` for 410/404 dead-subscription cleanup.
 * The adapter calls this after receiving a 410/404 from the push provider, matching the
 * `onSubscriptionDead` callback in the webapp's `sendWebPushToSubscriptions`.
 */
import { createHmac } from 'node:crypto';
import { integratorWebhookSecret } from '../../config/env.js';
import type { VapidCredentials, WebPushAccessPort, WebPushSubscriptionPayload } from '../../kernel/contracts/index.js';

function signGet(timestamp: string, canonicalGet: string, secret: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${canonicalGet}`).digest('base64url');
}

function signPost(timestamp: string, body: string, secret: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('base64url');
}

async function fetchSignedGet<T>(input: {
  baseUrl: string;
  path: string;
  query: Record<string, string>;
  secret: string;
  parseResponse: (data: Record<string, unknown>) => T | null;
}): Promise<T | null> {
  const { baseUrl, path, query, secret, parseResponse } = input;
  const search = new URLSearchParams(query).toString();
  const url = `${baseUrl.replace(/\/$/, '')}${path}${search ? `?${search}` : ''}`;
  const canonicalGet = `GET ${path}${search ? `?${search}` : ''}`;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = signGet(timestamp, canonicalGet, secret);
  const headers: Record<string, string> = {
    'X-Bersoncare-Timestamp': timestamp,
    'X-Bersoncare-Signature': signature,
  };
  try {
    const res = await fetch(url, { method: 'GET', headers });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || data.ok !== true) return null;
    return parseResponse(data);
  } catch {
    return null;
  }
}

/**
 * Creates the `WebPushAccessPort` using the integrator webhook secret + webapp base URL.
 *
 * Wire in di.ts as part of S14 (WebPushDeliveryAdapter); NOT wired yet in S13
 * (S13 = read-access plumbing only, no adapter/send).
 */
export function createWebPushAccessPort(deps: {
  getAppBaseUrl: () => Promise<string>;
}): WebPushAccessPort {
  const { getAppBaseUrl } = deps;

  return {
    async getSubscriptionsForUser(pushUserId: string): Promise<WebPushSubscriptionPayload[] | null> {
      const baseUrl = await getAppBaseUrl();
      const secret = integratorWebhookSecret();
      if (!baseUrl || !secret) return null;

      return fetchSignedGet<WebPushSubscriptionPayload[]>({
        baseUrl,
        path: '/api/integrator/web-push/subscriptions',
        query: { userId: pushUserId },
        secret,
        parseResponse: (data) => {
          if (!Array.isArray(data.subscriptions)) return null;
          // Validate and narrow the subscription shape
          return (data.subscriptions as unknown[]).filter((sub): sub is WebPushSubscriptionPayload => {
            if (sub === null || typeof sub !== 'object') return false;
            const s = sub as Record<string, unknown>;
            if (typeof s.endpoint !== 'string') return false;
            if (typeof s.keys !== 'object' || s.keys === null) return false;
            const k = s.keys as Record<string, unknown>;
            return typeof k.p256dh === 'string' && typeof k.auth === 'string';
          });
        },
      });
    },

    async getVapidCredentials(): Promise<VapidCredentials | null> {
      const baseUrl = await getAppBaseUrl();
      const secret = integratorWebhookSecret();
      if (!baseUrl || !secret) return null;

      return fetchSignedGet<VapidCredentials>({
        baseUrl,
        path: '/api/integrator/web-push/vapid',
        query: {},
        secret,
        parseResponse: (data) => {
          const v = data.vapid as Record<string, unknown> | undefined;
          if (!v || typeof v !== 'object') return null;
          const publicKey = typeof v.publicKey === 'string' ? v.publicKey : '';
          const privateKey = typeof v.privateKey === 'string' ? v.privateKey : '';
          const subject = typeof v.subject === 'string' ? v.subject : '';
          if (!publicKey || !privateKey || !subject) return null;
          return { publicKey, privateKey, subject };
        },
      });
    },

    async deleteSubscriptionByEndpoint(endpoint: string): Promise<boolean> {
      const baseUrl = await getAppBaseUrl();
      const secret = integratorWebhookSecret();
      if (!baseUrl || !secret) return false;

      const url = `${baseUrl.replace(/\/$/, '')}/api/integrator/web-push/subscriptions/delete`;
      const body = JSON.stringify({ endpoint });
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = signPost(timestamp, body, secret);
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Bersoncare-Timestamp': timestamp,
            'X-Bersoncare-Signature': signature,
          },
          body,
        });
        return res.ok;
      } catch {
        return false;
      }
    },
  };
}
