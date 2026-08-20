import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReminderRule } from '@/modules/reminders/types';

vi.mock('@/modules/system-settings/integrationRuntime', () => ({
  getIntegratorApiUrl: vi.fn().mockResolvedValue('http://integrator.test'),
  getIntegratorWebhookSecret: vi.fn().mockResolvedValue('test-secret'),
}));
vi.mock('@/modules/reminders/buildReminderDeepLink', () => ({
  buildReminderDeepLink: vi.fn().mockReturnValue('/app/reminders'),
}));
vi.mock('@/config/env', () => ({ env: { APP_BASE_URL: 'http://webapp.test' } }));
vi.mock('@bersoncare/db-principal', () => ({ getCurrentCorrelationIdHeader: vi.fn(() => ({})) }));

import { deliverIntegratorPushPayload } from './deliverIntegratorPushPayload';
import { postReminderRuleUpsertToIntegrator } from './integratorM2mPosts';

const rule: ReminderRule = {
  id: 'rule-a', integratorUserId: '42', category: 'lfk', enabled: false,
  intervalMinutes: 60, windowStartMinute: 540, windowEndMinute: 600, daysMask: '1111111',
  timezone: 'Europe/Moscow', fallbackEnabled: true, linkedObjectType: null, linkedObjectId: null,
  customTitle: null, customText: null, scheduleType: 'interval_window', scheduleData: null,
  reminderIntent: 'generic', displayTitle: null, displayDescription: null,
  quietHoursStartMinute: null, quietHoursEndMinute: null, notificationTopicCode: null,
  updatedAt: '2026-08-16T00:00:00.000Z',
};

function postedIdempotencyKey(fetchMock: ReturnType<typeof vi.fn>, call: number): string {
  const [, options] = fetchMock.mock.calls[call] as [string, RequestInit];
  return (JSON.parse(String(options.body)) as { idempotencyKey: string }).idempotencyKey;
}

describe('reminder rule M2M idempotency keys', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('uses the fallback-outbox key for both immediate and retried delivery', async () => {
    await postReminderRuleUpsertToIntegrator(rule);
    await deliverIntegratorPushPayload({
      id: '1',
      kind: 'reminder_rule_upsert',
      idempotencyKey: 'reminder_rule:rule-a',
      payload: rule,
      attemptsDone: 0,
      maxAttempts: 10,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(postedIdempotencyKey(fetchMock, 0)).toBe('reminder_rule:rule-a');
    expect(postedIdempotencyKey(fetchMock, 1)).toBe(postedIdempotencyKey(fetchMock, 0));
  });
});
