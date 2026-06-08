import { describe, expect, it } from 'vitest';

import type { ReminderCategory, ReminderRuleRecord } from '../../contracts/reminders.js';
import { reminderOccurrenceTopicCode } from './reminderNotificationTopicCode.js';

/**
 * Must mirror the fixture table in
 * apps/webapp/src/modules/reminders/reminderOccurrenceTopicCode.parity.test.ts (`REMINDER_TOPIC_CODE_PARITY_CASES`): duplicate
 * that block when updating rules.
 */
const REMINDER_TOPIC_CODE_PARITY_CASES: ReadonlyArray<{
  readonly name: string;
  readonly rule:
    | {
        readonly category?: string;
        readonly notificationTopicCode?: string | null;
        readonly reminderIntent?: string | null;
        readonly linkedObjectType?: string | null;
      }
    | undefined;
  readonly occCategory: string;
  readonly expected: string | undefined;
}> = [
  {
    name: 'explicit notification_topic_code wins (trimmed)',
    rule: {
      category: 'water',
      notificationTopicCode: '  custom_topic  ',
      reminderIntent: 'generic',
    },
    occCategory: 'water',
    expected: 'custom_topic',
  },
  {
    name: 'water category with generic intent — no inherited topic (not exercise_reminders)',
    rule: {
      category: 'water',
      notificationTopicCode: null,
      reminderIntent: 'generic',
    },
    occCategory: 'water',
    expected: undefined,
  },
  {
    name: 'warmup intent maps to warmup_reminders',
    rule: {
      category: 'supplements_medication',
      notificationTopicCode: null,
      reminderIntent: 'warmup',
    },
    occCategory: 'supplements_medication',
    expected: 'warmup_reminders',
  },
  {
    name: 'linkedObjectType rehab_program maps to training_reminders',
    rule: {
      category: 'supplements_medication',
      notificationTopicCode: null,
      linkedObjectType: 'rehab_program',
    },
    occCategory: 'supplements_medication',
    expected: 'training_reminders',
  },
  {
    name: 'occurrence category exercise when rule is undefined',
    rule: undefined,
    occCategory: 'exercise',
    expected: 'training_reminders',
  },
  {
    name: 'occurrence category warmup when rule is undefined',
    rule: undefined,
    occCategory: 'warmup',
    expected: 'warmup_reminders',
  },
  {
    name: 'occurrence category breathing when rule is undefined',
    rule: undefined,
    occCategory: 'breathing',
    expected: 'training_reminders',
  },
  {
    name: 'supplements category alone — no heuristic topic',
    rule: {
      category: 'supplements_medication',
      notificationTopicCode: null,
      reminderIntent: null,
      linkedObjectType: null,
    },
    occCategory: 'supplements_medication',
    expected: undefined,
  },
];

function minimalRuleFromFixture(
  rule: (typeof REMINDER_TOPIC_CODE_PARITY_CASES)[number]['rule'],
): ReminderRuleRecord | undefined {
  if (!rule) return undefined;
  const category = (rule.category ?? 'exercise') as ReminderCategory;
  return {
    id: 'parity-rule',
    userId: 'parity-user',
    category,
    isEnabled: true,
    scheduleType: 'parity',
    timezone: 'Europe/Moscow',
    intervalMinutes: 60,
    windowStartMinute: 0,
    windowEndMinute: 1440,
    daysMask: '1',
    contentMode: 'none',
    notificationTopicCode: rule.notificationTopicCode ?? null,
    reminderIntent: rule.reminderIntent ?? null,
    linkedObjectType: rule.linkedObjectType ?? null,
  };
}

describe('reminderOccurrenceTopicCode integrator (parity vs webapp)', () => {
  for (const c of REMINDER_TOPIC_CODE_PARITY_CASES) {
    it(c.name, () => {
      const rule = minimalRuleFromFixture(c.rule);
      expect(reminderOccurrenceTopicCode(rule, c.occCategory as ReminderCategory)).toBe(c.expected);
    });
  }
});
