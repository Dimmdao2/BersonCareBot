import { describe, expect, it } from "vitest";

import {
  reminderOccurrenceTopicCode,
  type ReminderRuleForTopicCode,
} from "./reminderOccurrenceTopicCode";

/**
 * Mirror the fixture table below in
 * apps/integrator/src/kernel/domain/reminders/reminderNotificationTopicCode.parity.test.ts (`REMINDER_TOPIC_CODE_PARITY_CASES`).
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
    name: "explicit notification_topic_code wins (trimmed)",
    rule: {
      category: "water",
      notificationTopicCode: "  custom_topic  ",
      reminderIntent: "generic",
    },
    occCategory: "water",
    expected: "custom_topic",
  },
  {
    name: "water category with generic intent — no inherited topic (not exercise_reminders)",
    rule: {
      category: "water",
      notificationTopicCode: null,
      reminderIntent: "generic",
    },
    occCategory: "water",
    expected: undefined,
  },
  {
    name: "warmup intent maps to exercise_reminders",
    rule: {
      category: "supplements_medication",
      notificationTopicCode: null,
      reminderIntent: "warmup",
    },
    occCategory: "supplements_medication",
    expected: "exercise_reminders",
  },
  {
    name: "linkedObjectType rehab_program maps to exercise_reminders",
    rule: {
      category: "supplements_medication",
      notificationTopicCode: null,
      linkedObjectType: "rehab_program",
    },
    occCategory: "supplements_medication",
    expected: "exercise_reminders",
  },
  {
    name: "occurrence category exercise when rule is undefined",
    rule: undefined,
    occCategory: "exercise",
    expected: "exercise_reminders",
  },
  {
    name: "occurrence category warmup when rule is undefined",
    rule: undefined,
    occCategory: "warmup",
    expected: "exercise_reminders",
  },
  {
    name: "occurrence category breathing when rule is undefined",
    rule: undefined,
    occCategory: "breathing",
    expected: "exercise_reminders",
  },
  {
    name: "supplements category alone — no heuristic topic",
    rule: {
      category: "supplements_medication",
      notificationTopicCode: null,
      reminderIntent: null,
      linkedObjectType: null,
    },
    occCategory: "supplements_medication",
    expected: undefined,
  },
];

describe("reminderOccurrenceTopicCode (parity vs integrator)", () => {
  for (const c of REMINDER_TOPIC_CODE_PARITY_CASES) {
    it(c.name, () => {
      const rule =
        c.rule === undefined ?
          undefined
        : ({
            category: c.rule.category,
            notificationTopicCode: c.rule.notificationTopicCode ?? undefined,
            reminderIntent: c.rule.reminderIntent ?? undefined,
            linkedObjectType: c.rule.linkedObjectType ?? undefined,
          } satisfies ReminderRuleForTopicCode);
      expect(reminderOccurrenceTopicCode(rule, c.occCategory)).toBe(c.expected);
    });
  }
});
