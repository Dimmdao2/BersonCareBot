import { describe, expect, it } from 'vitest';
import { reminderOccurrenceTopicCode } from './reminderNotificationTopicCode.js';
import type { ReminderRuleRecord } from '../../contracts/reminders.js';

const baseRule = {
  id: 'r',
  userId: 'u',
  category: 'water' as const,
  isEnabled: true,
  scheduleType: 'daily',
  timezone: 'Europe/Moscow',
  intervalMinutes: 60,
  windowStartMinute: 0,
  windowEndMinute: 1440,
  daysMask: '127',
  contentMode: 'none' as const,
};

describe('reminderOccurrenceTopicCode', () => {
  it('maps exercise categories without rule', () => {
    expect(reminderOccurrenceTopicCode(undefined, 'warmup')).toBe('exercise_reminders');
    expect(reminderOccurrenceTopicCode(undefined, 'water')).toBeUndefined();
  });

  it('maps linked treatment program to exercise topic', () => {
    const rule = {
      ...baseRule,
      linkedObjectType: 'treatment_program_item',
      linkedObjectId: 'a:b',
    } satisfies ReminderRuleRecord;
    expect(reminderOccurrenceTopicCode(rule, 'water')).toBe('exercise_reminders');
  });
});
