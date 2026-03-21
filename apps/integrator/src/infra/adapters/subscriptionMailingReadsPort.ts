/**
 * Reads subscription/mailing product data from webapp GET /api/integrator/subscriptions/*.
 * Used when readPort delegates mailing.topics.list and subscriptions.byUser to webapp projection.
 * On network/error returns [] (safe fallback).
 */
import { createHmac } from 'node:crypto';
import { env, integratorWebhookSecret } from '../../config/env.js';
import type {
  SubscriptionMailingReadsPort,
  MailingTopicReadRow,
  UserSubscriptionReadRow,
} from '../../kernel/contracts/index.js';

function signGet(timestamp: string, canonicalGet: string, secret: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${canonicalGet}`).digest('base64url');
}

async function fetchSubscriptionsGet<T>(
  pathname: string,
  search: string,
): Promise<{ ok: boolean; data?: T; status: number }> {
  const baseUrl = env.APP_BASE_URL ?? '';
  const secret = integratorWebhookSecret();
  if (!baseUrl || !secret) {
    return { ok: false, status: 0 };
  }
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
    const data = (await res.json().catch(() => ({}))) as T;
    return { ok: res.ok && (data as { ok?: boolean }).ok === true, data, status: res.status };
  } catch (err) {
    console.warn('subscription reads GET failed', {
      pathname,
      status: 0,
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, status: 0 };
  }
}

export function createSubscriptionMailingReadsPort(): SubscriptionMailingReadsPort {
  return {
    async listTopics(): Promise<MailingTopicReadRow[]> {
      const result = await fetchSubscriptionsGet<{ topics?: Array<{ id?: string; code?: string; title?: string; key?: string; isActive?: boolean }> }>(
        '/api/integrator/subscriptions/topics',
        '',
      );
      if (!result.ok || !result.data?.topics) return [];
      return result.data.topics.map((t) => ({
        integratorTopicId: typeof t.id === 'string' ? t.id : String(t.id ?? ''),
        code: typeof t.code === 'string' ? t.code : '',
        title: typeof t.title === 'string' ? t.title : '',
        key: typeof t.key === 'string' ? t.key : '',
        isActive: typeof t.isActive === 'boolean' ? t.isActive : true,
      }));
    },

    async getSubscriptionsByUserId(integratorUserId: string): Promise<UserSubscriptionReadRow[]> {
      const search = new URLSearchParams({ integratorUserId });
      const result = await fetchSubscriptionsGet<{
        subscriptions?: Array<{ topicId?: string; topicCode?: string; isActive?: boolean }>;
      }>('/api/integrator/subscriptions/for-user', search.toString());
      if (!result.ok || !result.data?.subscriptions) return [];
      return result.data.subscriptions.map((s) => ({
        integratorTopicId: typeof s.topicId === 'string' ? s.topicId : String(s.topicId ?? ''),
        topicCode: typeof s.topicCode === 'string' ? s.topicCode : '',
        isActive: typeof s.isActive === 'boolean' ? s.isActive : true,
      }));
    },
  };
}
