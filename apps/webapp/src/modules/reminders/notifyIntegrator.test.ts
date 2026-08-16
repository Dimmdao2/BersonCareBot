import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReminderRule } from './types';

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  enqueue: vi.fn(),
}));

vi.mock('@/infra/integrator-push/integratorM2mPosts', () => ({
  postReminderRuleUpsertToIntegrator: mocks.post,
}));
vi.mock('@/infra/integrator-push/integratorPushOutbox', () => ({
  enqueueCurrentReminderRulePushDefault: mocks.enqueue,
}));

import { notifyIntegratorRuleUpdated } from './notifyIntegrator';

const rule: ReminderRule = {
  id: 'rule-a', integratorUserId: '42', category: 'lfk', enabled: false,
  intervalMinutes: 60, windowStartMinute: 540, windowEndMinute: 600, daysMask: '1111111',
  timezone: 'Europe/Moscow', fallbackEnabled: true, linkedObjectType: null, linkedObjectId: null,
  customTitle: null, customText: null, scheduleType: 'interval_window', scheduleData: null,
  reminderIntent: 'generic', displayTitle: null, displayDescription: null,
  quietHoursStartMinute: null, quietHoursEndMinute: null, notificationTopicCode: null,
  updatedAt: '2026-08-16T00:00:00.000Z',
};

describe('reminder integrator fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.post.mockRejectedValue(new Error('integrator reminders/rules 500: synthetic outage'));
    mocks.enqueue.mockResolvedValue(undefined);
  });

  it('treats a recoverable immediate 5xx as saved after the current-rule capability accepts both retries', async () => {
    await expect(notifyIntegratorRuleUpdated(rule)).resolves.toBeUndefined();
    await expect(notifyIntegratorRuleUpdated({ ...rule, enabled: true })).resolves.toBeUndefined();

    expect(mocks.post).toHaveBeenCalledTimes(2);
    expect(mocks.enqueue).toHaveBeenCalledTimes(2);
    expect(mocks.enqueue).toHaveBeenNthCalledWith(1, 'rule-a');
    expect(mocks.enqueue).toHaveBeenNthCalledWith(2, 'rule-a');
  });
});
