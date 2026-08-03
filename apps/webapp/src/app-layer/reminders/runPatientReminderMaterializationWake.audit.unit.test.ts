import { describe, expect, it, vi } from 'vitest';
import type {
  PatientReminderMaterializationPort,
  PatientReminderRuleForMaterialization,
} from '@/modules/reminders/patientReminderMaterializationPort';
import { runPatientReminderMaterializationWake } from './runPatientReminderMaterializationWake';

const rule: PatientReminderRuleForMaterialization = {
  id: 'rule-snoozed',
  organizationId: '11111111-1111-4111-8111-111111111111',
  platformUserId: '22222222-2222-4222-8222-222222222222',
  integratorUserId: '42',
  category: 'warmup',
  isEnabled: true,
  scheduleType: 'slots_v1',
  timezone: 'Europe/Moscow',
  intervalMinutes: 60,
  windowStartMinute: 600,
  windowEndMinute: 600,
  daysMask: '1111111',
  scheduleData: { timesLocal: ['10:00'], dayFilter: 'weekdays' },
  quietHoursStartMinute: null,
  quietHoursEndMinute: null,
  linkedObjectType: null,
  linkedObjectId: null,
  customTitle: null,
  customText: null,
  displayTitle: null,
  reminderIntent: 'warmup',
  notificationTopicCode: 'warmup_reminders',
};

describe('D30 Ш4 saved oracle: canonical snooze generation', () => {
  it('materializes a planned snoozed occurrence even after its original rule slot is past', async () => {
    const materializeOccurrence = vi.fn(async () => 'materialized' as const);
    const port: PatientReminderMaterializationPort = {
      listEnabledRules: vi.fn(async () => [rule]),
      listDuePlannedOccurrences: vi.fn(async () => [
        {
          ruleId: rule.id,
          draft: {
            occurrenceKey: 'rule-snoozed:2026-08-03T07:00:00.000Z',
            plannedAt: '2026-08-03T07:04:00.000Z',
          },
        },
      ]),
      resolveLinkedTitle: vi.fn(async () => null),
      materializeOccurrence,
    };

    await runPatientReminderMaterializationWake(
      rule.organizationId,
      new Date('2026-08-03T07:05:00.000Z'), // 10:05 Europe/Moscow; original 10:00 slot is past.
      port,
    );

    expect(
      materializeOccurrence,
      'app.patient_snooze_reminder_occurrence leaves the same occurrence planned at g+1; the wake must claim that canonical row independently of future rule-slot planning',
    ).toHaveBeenCalledTimes(1);
  });
});
