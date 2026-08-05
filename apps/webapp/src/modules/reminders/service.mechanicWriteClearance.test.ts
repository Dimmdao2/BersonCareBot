import { describe, expect, it, vi } from 'vitest';
import {
  MechanicWriteClearanceRequiredError,
  assertMechanicWriteClearance,
  enterWithMechanicWriteClearance,
  runWithoutMechanicWriteClearance,
} from '@/app-layer/entitlements/mechanicWriteClearance';
import { createRemindersService } from './service';
import type { ReminderRulesPort } from './ports';
import { DEFAULT_WARMUPS_SECTION_SLUG } from '@/modules/patient-home/warmupsSection';

const USER_ID = '22222222-2222-4222-8222-222222222222';
const RULE_ID = '33333333-3333-4333-8333-333333333333';

function warmupRule() {
  return {
    id: RULE_ID,
    platformUserId: USER_ID,
    integratorUserId: null,
    linkedObjectType: 'content_section' as const,
    linkedObjectId: DEFAULT_WARMUPS_SECTION_SLUG,
    customTitle: null,
    customText: null,
    enabled: true,
    scheduleType: 'slots_v1' as const,
    intervalMinutes: 60,
    windowStartMinute: 480,
    windowEndMinute: 1200,
    daysMask: '1111100',
    scheduleData: { timesLocal: ['09:00'], dayFilter: 'weekdays' as const },
    quietHoursStartMinute: null,
    quietHoursEndMinute: null,
    reminderIntent: null,
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
  };
}

function buildService() {
  const updateScheduleAndType = vi.fn(async () => undefined);
  const port = {
    listByPlatformUserWithObjects: vi.fn(async () => [warmupRule()]),
    updateScheduleAndType,
    cancelWebPushPendingOccurrences: vi.fn(async () => undefined),
  } as unknown as ReminderRulesPort;
  const service = createRemindersService(port, {
    assertWriteClearance: assertMechanicWriteClearance,
  });
  return { service, updateScheduleAndType };
}

describe('reminders service — 3.2 physical door (warmups via updateRule)', () => {
  it('refuses warmup schedule update when no warmups mutation decision ran first', async () => {
    const { service, updateScheduleAndType } = buildService();
    await runWithoutMechanicWriteClearance(async () => {
      await expect(
        service.updateRule(USER_ID, RULE_ID, {
          schedule: {
            scheduleType: 'slots_v1',
            intervalMinutes: 60,
            windowStartMinute: 480,
            windowEndMinute: 1200,
            daysMask: '1111100',
            scheduleData: { timesLocal: ['10:00'], dayFilter: 'weekdays' },
          },
        }),
      ).rejects.toBeInstanceOf(MechanicWriteClearanceRequiredError);
    });
    expect(updateScheduleAndType).not.toHaveBeenCalled();
  });

  it('proceeds once the mutation guard cleared warmups for this continuation', async () => {
    const { service, updateScheduleAndType } = buildService();
    await runWithoutMechanicWriteClearance(async () => {
      enterWithMechanicWriteClearance('warmups');
      const result = await service.updateRule(USER_ID, RULE_ID, {
        schedule: {
          scheduleType: 'slots_v1',
          intervalMinutes: 60,
          windowStartMinute: 480,
          windowEndMinute: 1200,
          daysMask: '1111100',
          scheduleData: { timesLocal: ['10:00'], dayFilter: 'weekdays' },
        },
      });
      expect(result.ok).toBe(true);
    });
    expect(updateScheduleAndType).toHaveBeenCalledOnce();
  });
});
