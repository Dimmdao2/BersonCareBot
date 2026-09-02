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
import type {
  VapidCredentials,
  WebPushAccessPort,
  WebPushSubscriptionPayload,
} from '../../kernel/contracts/index.js';

function signGet(timestamp: string, canonicalGet: string, secret: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${canonicalGet}`).digest('base64url');
}

function signPost(timestamp: string, body: string, secret: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('base64url');
}

async function requireAccessConfig(
  getAppBaseUrl: () => Promise<string>,
  organizationId: string,
): Promise<{ baseUrl: string; secret: string }> {
  try {
    const [baseUrl, secret] = await Promise.all([
      getAppBaseUrl(),
      Promise.resolve(integratorWebhookSecret()),
    ]);
    if (!baseUrl || !secret || !organizationId) {
      throw new Error('missing_runtime_config');
    }
    return { baseUrl, secret };
  } catch (cause) {
    throw new Error('WEB_PUSH_ACCESS_UNAVAILABLE:runtime_config', { cause });
  }
}

async function fetchSignedGet<T>(input: {
  baseUrl: string;
  path: string;
  query: Record<string, string>;
  secret: string;
  parseResponse: (data: Record<string, unknown>) => T | null;
}): Promise<T> {
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
  let res: Response;
  try {
    res = await fetch(url, { method: 'GET', headers });
  } catch (cause) {
    throw new Error('WEB_PUSH_ACCESS_UNAVAILABLE:network', { cause });
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || data.ok !== true) {
    throw new Error(`WEB_PUSH_ACCESS_UNAVAILABLE:http_${res.status}`);
  }
  const parsed = parseResponse(data);
  if (parsed === null) {
    throw new Error('WEB_PUSH_ACCESS_UNAVAILABLE:invalid_response');
  }
  return parsed;
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
    async getSubscriptionsForUser(
      pushUserId: string,
      organizationId: string,
    ): Promise<WebPushSubscriptionPayload[]> {
      const { baseUrl, secret } = await requireAccessConfig(getAppBaseUrl, organizationId);

      return fetchSignedGet<WebPushSubscriptionPayload[]>({
        baseUrl,
        path: '/api/integrator/web-push/subscriptions',
        query: { userId: pushUserId, organizationId },
        secret,
        parseResponse: (data) => {
          if (!Array.isArray(data.subscriptions)) return null;
          const subscriptions = data.subscriptions as unknown[];
          const valid = subscriptions.every((sub): sub is WebPushSubscriptionPayload => {
            if (sub === null || typeof sub !== 'object') return false;
            const s = sub as Record<string, unknown>;
            if (typeof s.endpoint !== 'string') return false;
            if (typeof s.keys !== 'object' || s.keys === null) return false;
            const k = s.keys as Record<string, unknown>;
            return typeof k.p256dh === 'string' && typeof k.auth === 'string';
          });
          return valid ? subscriptions : null;
        },
      });
    },

    async getVapidCredentials(organizationId: string): Promise<VapidCredentials> {
      const { baseUrl, secret } = await requireAccessConfig(getAppBaseUrl, organizationId);

      return fetchSignedGet<VapidCredentials>({
        baseUrl,
        path: '/api/integrator/web-push/vapid',
        query: { organizationId },
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

    async deleteSubscriptionByEndpoint(
      pushUserId: string,
      endpoint: string,
      organizationId: string,
    ): Promise<boolean> {
      const baseUrl = await getAppBaseUrl();
      const secret = integratorWebhookSecret();
      if (!baseUrl || !secret || !organizationId || !pushUserId) return false;

      const url = `${baseUrl.replace(/\/$/, '')}/api/integrator/web-push/subscriptions/delete`;
      const body = JSON.stringify({ endpoint, pushUserId, organizationId });
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
