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
  linkedTitle: null,
};

describe('D30 Ш4 saved oracle: canonical snooze generation', () => {
  it('materializes a planned snoozed occurrence even after its original rule slot is past', async () => {
    const materializeOccurrence = vi.fn(async () => 'materialized' as const);
    const port: PatientReminderMaterializationPort = {
      readSnapshot: vi.fn(async () => ({
        rules: [rule],
        dueOccurrences: [
          {
            ruleId: rule.id,
            draft: {
              occurrenceKey: 'rule-snoozed:2026-08-03T07:00:00.000Z',
              plannedAt: '2026-08-03T07:04:00.000Z',
            },
            occurrence: {
              id: 'occurrence-snoozed',
              deliveryGeneration: 1,
              plannedAt: '2026-08-03T07:04:00.000Z',
            },
          },
        ],
      })),
      readDeliveryTargetSnapshot: vi.fn(async () => null),
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

describe('D31 VK messenger delivery acceptance', () => {
  it('materializes a VK delivery for a VK-linked patient who enabled the channel', async () => {
    const materializeOccurrence = vi.fn(async () => 'materialized' as const);
    const port: PatientReminderMaterializationPort = {
      readSnapshot: vi.fn(async () => ({
        rules: [rule],
        dueOccurrences: [
          {
            ruleId: rule.id,
            draft: {
              occurrenceKey: 'rule-snoozed:2026-08-03T07:00:00.000Z',
              plannedAt: '2026-08-03T07:04:00.000Z',
            },
            occurrence: {
              id: 'occurrence-vk',
              deliveryGeneration: 0,
              plannedAt: '2026-08-03T07:04:00.000Z',
            },
          },
        ],
      })),
      readDeliveryTargetSnapshot: vi.fn(async () => ({
        vkId: 'vk-user-17',
        channelPreferences: [
          {
            channelCode: 'vk' as const,
            isEnabledForMessages: true,
            isEnabledForNotifications: true,
            isPreferredForAuth: false,
          },
        ],
        topicChannelRows: [],
        emailVerified: false,
        muted: false,
        topicMasterEnabled: true,
        hasWebPushSubscription: false,
        vapidConfigured: true,
        smtpConfigured: false,
      })),
      materializeOccurrence,
    };

    await runPatientReminderMaterializationWake(
      rule.organizationId,
      new Date('2026-08-03T07:05:00.000Z'),
      port,
    );

    expect(materializeOccurrence).toHaveBeenCalledWith(
      rule,
      expect.any(Object),
      expect.any(Object),
      [
        expect.objectContaining({
          channel: 'vk',
          externalId: 'vk-user-17',
          intent: expect.objectContaining({
            meta: expect.objectContaining({ source: 'vk' }),
            payload: expect.objectContaining({
              recipient: { userId: 'vk-user-17' },
              delivery: expect.objectContaining({ channels: ['vk'] }),
            }),
          }),
        }),
      ],
    );
  });
});

describe('C3M-08 rehabilitation workspace closure', () => {
  it('does not materialize or resolve delivery targets for hidden rehabilitation rules', async () => {
    const rehabilitationRule: PatientReminderRuleForMaterialization = {
      ...rule,
      id: 'rule-rehabilitation',
      category: 'lfk',
      reminderIntent: 'exercises',
      linkedObjectType: 'rehab_program',
      linkedObjectId: 'program-17',
      notificationTopicCode: 'rehab_program_reminders',
    };
    const readDeliveryTargetSnapshot = vi.fn(async () => null);
    const materializeOccurrence = vi.fn(async () => 'materialized' as const);
    const port: PatientReminderMaterializationPort = {
      readSnapshot: vi.fn(async () => ({
        rules: [rule, rehabilitationRule],
        dueOccurrences: [
          {
            ruleId: rule.id,
            draft: {
              occurrenceKey: `${rule.id}:2026-08-03T07:00:00.000Z`,
              plannedAt: '2026-08-03T07:00:00.000Z',
            },
            occurrence: {
              id: 'occurrence-warmup',
              deliveryGeneration: 0,
              plannedAt: '2026-08-03T07:00:00.000Z',
            },
          },
          {
            ruleId: rehabilitationRule.id,
            draft: {
              occurrenceKey: `${rehabilitationRule.id}:2026-08-03T07:00:00.000Z`,
              plannedAt: '2026-08-03T07:00:00.000Z',
            },
            occurrence: {
              id: 'occurrence-rehabilitation',
              deliveryGeneration: 0,
              plannedAt: '2026-08-03T07:00:00.000Z',
            },
          },
        ],
      })),
      readDeliveryTargetSnapshot,
      materializeOccurrence,
    };

    const result = await runPatientReminderMaterializationWake(
      rule.organizationId,
      new Date('2026-08-03T07:05:00.000Z'),
      port,
      { rehabilitationEnabled: false },
    );

    expect(result).toMatchObject({ rules: 1, occurrences: 1, materialized: 1 });
    expect(readDeliveryTargetSnapshot).toHaveBeenCalledTimes(1);
    expect(readDeliveryTargetSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ topicCode: rule.notificationTopicCode }),
    );
    expect(materializeOccurrence).toHaveBeenCalledTimes(1);
    expect(materializeOccurrence).toHaveBeenCalledWith(
      rule,
      expect.any(Object),
      expect.objectContaining({ id: 'occurrence-warmup' }),
      expect.any(Array),
    );
  });

  it('restores the same rehabilitation rule and occurrence when the module is enabled again', async () => {
    const rehabilitationRule: PatientReminderRuleForMaterialization = {
      ...rule,
      id: 'rule-rehabilitation-restored',
      category: 'lfk',
      reminderIntent: 'exercises',
      linkedObjectType: 'rehab_program',
      linkedObjectId: 'program-17',
    };
    const materializeOccurrence = vi.fn(async () => 'materialized' as const);
    const port: PatientReminderMaterializationPort = {
      readSnapshot: vi.fn(async () => ({
        rules: [rehabilitationRule],
        dueOccurrences: [
          {
            ruleId: rehabilitationRule.id,
            draft: {
              occurrenceKey: `${rehabilitationRule.id}:2026-08-03T07:00:00.000Z`,
              plannedAt: '2026-08-03T07:00:00.000Z',
            },
            occurrence: {
              id: 'occurrence-rehabilitation-restored',
              deliveryGeneration: 0,
              plannedAt: '2026-08-03T07:00:00.000Z',
            },
          },
        ],
      })),
      readDeliveryTargetSnapshot: vi.fn(async () => null),
      materializeOccurrence,
    };

    await runPatientReminderMaterializationWake(
      rehabilitationRule.organizationId,
      new Date('2026-08-03T07:05:00.000Z'),
      port,
      { rehabilitationEnabled: true },
    );

    expect(materializeOccurrence).toHaveBeenCalledWith(
      rehabilitationRule,
      expect.any(Object),
      expect.objectContaining({ id: 'occurrence-rehabilitation-restored' }),
      expect.any(Array),
    );
  });
});
