/**
 * Resolves delivery targets (channel bindings) via webapp GET /api/integrator/delivery-targets.
 * Used for booking and reminder fan-out to all linked channels.
 */
import { createHmac } from 'node:crypto';
import { integratorWebhookSecret } from '../../config/env.js';
import type {
  AdminMessengerTargets,
  DeliveryTargetsPort,
  DeliveryTargetsFetchOptions,
} from '../../kernel/contracts/index.js';
import type { DeliveryTargetsFetchResult } from '../../kernel/contracts/notificationChannels.js';

function signGet(timestamp: string, canonicalGet: string, secret: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${canonicalGet}`).digest('base64url');
}

async function fetchAdminMessengerTargets(
  getAppBaseUrl: () => Promise<string>,
): Promise<AdminMessengerTargets | null> {
  const baseUrl = await getAppBaseUrl();
  const secret = integratorWebhookSecret();
  if (!baseUrl || !secret) return null;

  const pathname = '/api/integrator/admin-notification-targets';
  const url = `${baseUrl.replace(/\/$/, '')}${pathname}`;
  const canonicalGet = `GET ${pathname}`;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = signGet(timestamp, canonicalGet, secret);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Bersoncare-Timestamp': timestamp,
        'X-Bersoncare-Signature': signature,
      },
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      adminMessengerTargets?: {
        telegramUserIds?: unknown;
        maxUserIds?: unknown;
      };
    };
    if (!res.ok || data.ok !== true || !data.adminMessengerTargets) return null;
    const { telegramUserIds, maxUserIds } = data.adminMessengerTargets;
    const isStringArray = (value: unknown): value is string[] =>
      Array.isArray(value) &&
      value.every((item) => typeof item === 'string' && item.trim().length > 0);
    if (!isStringArray(telegramUserIds) || !isStringArray(maxUserIds)) return null;
    return {
      telegram: telegramUserIds.map((item) => item.trim()),
      max: maxUserIds.map((item) => item.trim()),
    };
  } catch {
    return null;
  }
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
    Object.entries(query).filter(([, v]) => v != null && String(v).trim() !== '') as [
      string,
      string,
    ][],
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
      emailRecipient?: string;
    };
    if (res.status === 403) return { channelBindings: {}, tenantDenied: true };
    if (!res.ok || data.ok !== true) return null;
    const bindings = data.channelBindings;
    const channelBindings = typeof bindings === 'object' && bindings !== null ? bindings : {};
    return {
      channelBindings,
      ...(data.resolution ? { resolution: data.resolution } : {}),
      ...(typeof data.emailRecipient === 'string' && data.emailRecipient.trim()
        ? { emailRecipient: data.emailRecipient.trim() }
        : {}),
    };
  } catch {
    return null;
  }
}

export function createDeliveryTargetsPort(deps: {
  getAppBaseUrl: () => Promise<string>;
}): DeliveryTargetsPort {
  const { getAppBaseUrl } = deps;
  return {
    async getTargetsByPhone(
      phoneNormalized: string,
      options: DeliveryTargetsFetchOptions,
    ): Promise<DeliveryTargetsFetchResult | null> {
      const organizationId = options?.organizationId?.trim();
      if (!phoneNormalized || !phoneNormalized.trim() || !organizationId) return null;
      const topic = options?.topic?.trim();
      return fetchDeliveryTargets(getAppBaseUrl, {
        phone: phoneNormalized.trim(),
        organizationId,
        ...(topic ? { topic } : {}),
        ...(options?.integratorUserId ? { integratorUserId: options.integratorUserId } : {}),
      });
    },
    async getAdminMessengerTargets(): Promise<AdminMessengerTargets | null> {
      return fetchAdminMessengerTargets(getAppBaseUrl);
    },
    async getTargetsByChannelBinding(params: {
      telegramId?: string;
      maxId?: string;
      topic?: string;
      integratorUserId?: string;
      organizationId?: string;
    }): Promise<DeliveryTargetsFetchResult | null> {
      const topic = params.topic?.trim();
      const q = (base: Record<string, string>) => ({
        ...base,
        ...(topic ? { topic } : {}),
        ...(params.integratorUserId ? { integratorUserId: params.integratorUserId } : {}),
        ...(params.organizationId ? { organizationId: params.organizationId } : {}),
      });
      if (params.telegramId?.trim()) {
        return fetchDeliveryTargets(getAppBaseUrl, q({ telegramId: params.telegramId.trim() }));
      }
      if (params.maxId?.trim()) {
        return fetchDeliveryTargets(getAppBaseUrl, q({ maxId: params.maxId.trim() }));
      }
      return null;
    },
    async getTargetsByPlatformUser(params): Promise<DeliveryTargetsFetchResult | null> {
      if (!params.platformUserId.trim() || !params.topic.trim() || !params.organizationId.trim()) {
        return null;
      }
      return fetchDeliveryTargets(getAppBaseUrl, {
        platformUserId: params.platformUserId.trim(),
        topic: params.topic.trim(),
        organizationId: params.organizationId.trim(),
        ...(params.integratorUserId ? { integratorUserId: params.integratorUserId } : {}),
      });
    },
  };
}
