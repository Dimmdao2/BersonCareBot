/**
 * Resolves delivery targets (channel bindings) via webapp GET /api/integrator/delivery-targets.
 * Used for Rubitime/booking and reminder fan-out to all linked channels.
 */
import { createHmac } from 'node:crypto';
import { integratorWebhookSecret } from '../../config/env.js';
import type { DeliveryTargetsPort, DeliveryTargetsChannelBindings } from '../../kernel/contracts/index.js';

function signGet(timestamp: string, canonicalGet: string, secret: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${canonicalGet}`).digest('base64url');
}

async function fetchDeliveryTargets(
  getAppBaseUrl: () => Promise<string>,
  query: Record<string, string>,
): Promise<DeliveryTargetsChannelBindings | null> {
  const baseUrl = await getAppBaseUrl();
  const secret = integratorWebhookSecret();
  if (!baseUrl || !secret) return null;

  const pathname = '/api/integrator/delivery-targets';
  const search = new URLSearchParams(query).toString();
  const url = `${baseUrl.replace(/\/$/, '')}${pathname}${search ? `?${search}` : ''}`;
  const canonicalGet = `GET ${pathname}${search ? `?${search}` : ''}`;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = signGet(timestamp, canonicalGet, secret);
  const headers: Record<string, string> = {
    'X-Bersoncare-Timestamp': timestamp,
    'X-Bersoncare-Signature': signature,
  };
  try {
    const res = await fetch(url, { method: 'GET', headers });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; channelBindings?: Record<string, string> };
    if (!res.ok || data.ok !== true) return null;
    const bindings = data.channelBindings;
    return typeof bindings === 'object' && bindings !== null ? bindings : null;
  } catch {
    return null;
  }
}

export function createDeliveryTargetsPort(deps: { getAppBaseUrl: () => Promise<string> }): DeliveryTargetsPort {
  const { getAppBaseUrl } = deps;
  return {
    async getTargetsByPhone(phoneNormalized: string): Promise<DeliveryTargetsChannelBindings | null> {
      if (!phoneNormalized || !phoneNormalized.trim()) return null;
      return fetchDeliveryTargets(getAppBaseUrl, { phone: phoneNormalized.trim() });
    },
    async getTargetsByChannelBinding(params: {
      telegramId?: string;
      maxId?: string;
    }): Promise<DeliveryTargetsChannelBindings | null> {
      if (params.telegramId?.trim())
        return fetchDeliveryTargets(getAppBaseUrl, { telegramId: params.telegramId.trim() });
      if (params.maxId?.trim()) return fetchDeliveryTargets(getAppBaseUrl, { maxId: params.maxId.trim() });
      return null;
    },
  };
}
