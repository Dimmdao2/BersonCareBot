/**
 * Reads reminder product data from webapp GET /api/integrator/reminders/*.
 * Used when readPort delegates reminder rules/history to webapp projection.
 * On network/error returns [] or null (safe fallback).
 */
import { createHmac } from 'node:crypto';
import { getAppDisplayTimezoneSync } from '../../config/appTimezone.js';
import { env, integratorWebhookSecret } from '../../config/env.js';
import type {
  RemindersReadsPort,
  ReminderRuleListItem,
  ReminderRuleDetail,
  ReminderOccurrenceHistoryItem,
  ReminderCategory,
  ReminderContentMode,
} from '../../kernel/contracts/index.js';

function signGet(timestamp: string, canonicalGet: string, secret: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${canonicalGet}`).digest('base64url');
}

type WebappRuleRow = {
  id?: string;
  userId?: string;
  category?: string;
  isEnabled?: boolean;
  scheduleType?: string;
  timezone?: string;
  intervalMinutes?: number;
  windowStartMinute?: number;
  windowEndMinute?: number;
  daysMask?: string;
  contentMode?: string;
  createdAt?: string;
  updatedAt?: string;
};

type WebappHistoryRow = {
  id?: string;
  ruleId?: string;
  status?: string;
  deliveryChannel?: string | null;
  errorCode?: string | null;
  occurredAt?: string;
};

async function fetchRemindersGet<T>(
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
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; rules?: WebappRuleRow[]; rule?: WebappRuleRow | null; history?: WebappHistoryRow[] };
    return { ok: res.ok && data.ok === true, data: data as T, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

function mapRule(row: WebappRuleRow): ReminderRuleListItem {
  return {
    id: typeof row.id === 'string' ? row.id : String(row.id ?? ''),
    userId: typeof row.userId === 'string' ? row.userId : String(row.userId ?? ''),
    category: (typeof row.category === 'string' ? row.category : '') as ReminderCategory,
    isEnabled: Boolean(row.isEnabled),
    scheduleType: typeof row.scheduleType === 'string' ? row.scheduleType : 'interval_window',
    timezone: typeof row.timezone === 'string' ? row.timezone : 'Europe/Moscow',
    intervalMinutes: typeof row.intervalMinutes === 'number' ? row.intervalMinutes : 0,
    windowStartMinute: typeof row.windowStartMinute === 'number' ? row.windowStartMinute : 0,
    windowEndMinute: typeof row.windowEndMinute === 'number' ? row.windowEndMinute : 1440,
    daysMask: typeof row.daysMask === 'string' ? row.daysMask : '1111111',
    contentMode: (typeof row.contentMode === 'string' ? row.contentMode : 'none') as ReminderContentMode,
    ...(typeof row.createdAt === 'string' ? { createdAt: row.createdAt } : {}),
    ...(typeof row.updatedAt === 'string' ? { updatedAt: row.updatedAt } : {}),
  };
}

function mapHistoryRow(row: WebappHistoryRow): ReminderOccurrenceHistoryItem {
  const status = row.status === 'sent' || row.status === 'failed' ? row.status : 'sent';
  return {
    id: typeof row.id === 'string' ? row.id : String(row.id ?? ''),
    ruleId: typeof row.ruleId === 'string' ? row.ruleId : '',
    status,
    deliveryChannel: row.deliveryChannel ?? null,
    errorCode: row.errorCode ?? null,
    occurredAt: typeof row.occurredAt === 'string' ? row.occurredAt : new Date().toISOString(),
  };
}

export function createRemindersReadsPort(): RemindersReadsPort {
  return {
    async listRulesForUser(integratorUserId: string) {
      const search = new URLSearchParams({ integratorUserId });
      const result = await fetchRemindersGet<{ rules?: WebappRuleRow[] }>(
        '/api/integrator/reminders/rules',
        search.toString(),
      );
      if (!result.ok || !result.data?.rules) return [];
      const rows = Array.isArray(result.data.rules) ? result.data.rules : [];
      return rows.map(mapRule);
    },

    async getRuleForUserAndCategory(integratorUserId: string, category: string) {
      const search = new URLSearchParams({ integratorUserId, category });
      const result = await fetchRemindersGet<{ rule?: WebappRuleRow | null }>(
        '/api/integrator/reminders/rules/by-category',
        search.toString(),
      );
      if (!result.ok) return null;
      const rule = result.data?.rule;
      if (rule == null) return null;
      return mapRule(rule) as ReminderRuleDetail;
    },

    async listHistoryForUser(integratorUserId: string, limit = 50) {
      const search = new URLSearchParams({ integratorUserId, limit: String(limit) });
      const result = await fetchRemindersGet<{ history?: WebappHistoryRow[] }>(
        '/api/integrator/reminders/history',
        search.toString(),
      );
      if (!result.ok || !result.data?.history) return [];
      const rows = Array.isArray(result.data.history) ? result.data.history : [];
      return rows.map(mapHistoryRow);
    },
  };
}
