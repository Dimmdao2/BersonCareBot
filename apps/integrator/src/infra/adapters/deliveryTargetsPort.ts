/**
 * Resolves delivery targets (channel bindings) via webapp GET /api/integrator/delivery-targets.
 * Used for Rubitime/booking and reminder fan-out to all linked channels.
 */
import { createHmac } from 'node:crypto';
import { integratorWebhookSecret } from '../../config/env.js';
import type {
  DeliveryTargetsPort,
  DeliveryTargetsFetchOptions,
} from '../../kernel/contracts/index.js';
import type { DeliveryTargetsFetchResult } from '../../kernel/contracts/notificationChannels.js';

function signGet(timestamp: string, canonicalGet: string, secret: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${canonicalGet}`).digest('base64url');
}

async function fetchDeliveryTargets(
  getAppBaseUrl: () => Promise<string>,
  query: Record<string, string | undefined>,
): Promise<DeliveryTargetsFetchResult | null> {
  const baseUrl = await getAppBaseUrl();
  const secret = integratorWebhookSecret();
  if (!baseUrl || !secret) return null;

  const pathname = '/api/integrator/delivery-targets';
  const search = new URLSearchParams(
    Object.entries(query).filter(([, v]) => v != null && String(v).trim() !== '') as [string, string][],
  ).toString();
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
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      channelBindings?: Record<string, string>;
      resolution?: DeliveryTargetsFetchResult['resolution'];
    };
    if (!res.ok || data.ok !== true) return null;
    const bindings = data.channelBindings;
    const channelBindings = typeof bindings === 'object' && bindings !== null ? bindings : {};
    return {
      channelBindings,
      ...(data.resolution ? { resolution: data.resolution } : {}),
    };
  } catch {
    return null;
  }
}

export function createDeliveryTargetsPort(deps: { getAppBaseUrl: () => Promise<string> }): DeliveryTargetsPort {
  const { getAppBaseUrl } = deps;
  return {
    async getTargetsByPhone(
      phoneNormalized: string,
      options?: DeliveryTargetsFetchOptions,
    ): Promise<DeliveryTargetsFetchResult | null> {
      if (!phoneNormalized || !phoneNormalized.trim()) return null;
      const topic = options?.topic?.trim();
      return fetchDeliveryTargets(getAppBaseUrl, {
        phone: phoneNormalized.trim(),
        ...(topic ? { topic } : {}),
        ...(options?.integratorUserId ? { integratorUserId: options.integratorUserId } : {}),
      });
    },
    async getTargetsByChannelBinding(params: {
      telegramId?: string;
      maxId?: string;
      topic?: string;
      integratorUserId?: string;
    }): Promise<DeliveryTargetsFetchResult | null> {
      const topic = params.topic?.trim();
      const q = (base: Record<string, string>) => ({
        ...base,
        ...(topic ? { topic } : {}),
        ...(params.integratorUserId ? { integratorUserId: params.integratorUserId } : {}),
      });
      if (params.telegramId?.trim()) {
        return fetchDeliveryTargets(getAppBaseUrl, q({ telegramId: params.telegramId.trim() }));
      }
      if (params.maxId?.trim()) {
        return fetchDeliveryTargets(getAppBaseUrl, q({ maxId: params.maxId.trim() }));
      }
      return null;
    },
  };
}
