import { describe, expect, it, vi } from 'vitest';
import type { ReminderRulesPort } from './ports';
import {
  createRemindersService,
  reminderRuleIdFromIdempotencyKey,
} from './service';
import type { ReminderRule } from './types';

const USER_ID = '22222222-2222-4222-8222-222222222222';
const KEY = 'patient-reminder-create-retry-1';

function rule(id: string): ReminderRule {
  return {
    id,
    integratorUserId: '42',
    category: 'lfk',
    enabled: false,
    intervalMinutes: 120,
    windowStartMinute: 600,
    windowEndMinute: 1200,
    daysMask: '1111111',
    timezone: 'Europe/Moscow',
    fallbackEnabled: true,
    linkedObjectType: 'rehab_program',
    linkedObjectId: 'program-1',
    customTitle: null,
    customText: null,
    scheduleType: 'interval_window',
    scheduleData: null,
    reminderIntent: 'generic',
    displayTitle: null,
    displayDescription: null,
    quietHoursStartMinute: null,
    quietHoursEndMinute: null,
    notificationTopicCode: null,
    updatedAt: '2026-08-17T00:00:00.000Z',
  };
}

function params() {
  return {
    linkedObjectType: 'rehab_program' as const,
    linkedObjectId: 'program-1',
    enabled: false,
    idempotencyKey: KEY,
    schedule: {
      intervalMinutes: 120,
      windowStartMinute: 600,
      windowEndMinute: 1200,
      daysMask: '1111111',
    },
  };
}

describe('patient reminder create idempotency', () => {
  it('returns the existing owned rule without a second create', async () => {
    const id = reminderRuleIdFromIdempotencyKey(USER_ID, KEY);
    const existing = rule(id);
    const create = vi.fn(async () => existing);
    const port = {
      resolveIntegratorUserId: vi.fn(async () => '42'),
      listByPlatformUserWithObjects: vi.fn(async () => [existing]),
      create,
    } as unknown as ReminderRulesPort;
    const service = createRemindersService(port);

    await expect(service.createObjectReminder(USER_ID, params())).resolves.toEqual({
      ok: true,
      data: existing,
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('recovers the same owned rule when the insert commits but its response is lost', async () => {
    const id = reminderRuleIdFromIdempotencyKey(USER_ID, KEY);
    const existing = rule(id);
    const list = vi
      .fn<ReminderRulesPort['listByPlatformUserWithObjects']>()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([existing]);
    const create = vi.fn(async () => {
      throw new Error('response lost after commit');
    });
    const port = {
      resolveIntegratorUserId: vi.fn(async () => '42'),
      listByPlatformUserWithObjects: list,
      create,
    } as unknown as ReminderRulesPort;
    const service = createRemindersService(port);

    await expect(service.createObjectReminder(USER_ID, params())).resolves.toEqual({
      ok: true,
      data: existing,
    });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ integratorRuleId: id }));
  });
});
