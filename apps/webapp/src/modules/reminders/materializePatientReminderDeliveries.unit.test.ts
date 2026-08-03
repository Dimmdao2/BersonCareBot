import { describe, expect, it } from 'vitest';
import { materializePatientReminderDeliveries } from './materializePatientReminderDeliveries';

const input = {
  rule: {
    id: 'rule-1',
    organizationId: 'd0000000-0000-4000-8000-00000000000d',
    platformUserId: 'a0000000-0000-4000-8000-00000000000a',
    integratorUserId: '42',
    category: 'warmup',
    linkedObjectType: 'content_section',
    linkedObjectId: 'warmups',
    customTitle: 'Разминка',
    customText: 'Пора размяться',
    displayTitle: null,
    reminderIntent: 'warmup',
    notificationTopicCode: 'warmup_reminders',
  },
  occurrence: {
    id: 'occurrence-1',
    deliveryGeneration: 3,
    plannedAt: '2026-08-03T12:00:00.000Z',
  },
  targets: {
    selectedChannels: ['web_push', 'telegram', 'max', 'email'] as const,
    telegramId: '1001',
    maxId: 'max-1',
    emailRecipient: 'patient@example.test',
  },
  appBaseUrl: 'https://test.example',
};

describe('patient reminder ready-delivery materializer', () => {
  it('materializes four selected channels with stable generation identities', () => {
    const deliveries = materializePatientReminderDeliveries(input);
    expect(deliveries.map((delivery) => delivery.channel)).toEqual([
      'web_push',
      'telegram',
      'max',
      'email',
    ]);
    expect(deliveries.map((delivery) => delivery.eventId)).toEqual([
      'rem:occurrence-1:g3:web_push',
      'rem:occurrence-1:g3:telegram',
      'rem:occurrence-1:g3:max',
      'rem:occurrence-1:g3:email',
    ]);
    expect(deliveries.every((delivery) => delivery.kind === 'reminder_dispatch')).toBe(true);
  });

  it('owns copy, deep-link and callback keyboard before enqueue', () => {
    const deliveries = materializePatientReminderDeliveries(input);
    const telegram = deliveries.find((delivery) => delivery.channel === 'telegram');
    expect(telegram?.intent.payload).toEqual(
      expect.objectContaining({
        message: { text: '<b>Разминка</b>\n\nПора размяться' },
        replyMarkup: {
          inline_keyboard: expect.arrayContaining([
            [
              {
                text: 'Начать разминку',
                url: expect.stringContaining('/app/patient/go/daily-warmup'),
              },
            ],
          ]),
        },
      }),
    );
    const push = deliveries.find((delivery) => delivery.channel === 'web_push');
    expect(push?.intent.meta).toEqual(
      expect.objectContaining({
        outboundMessageClass: 'routine_product',
        outboundCapability: 'app_push',
      }),
    );
  });

  it('does not recreate disabled or unavailable channel legs', () => {
    const deliveries = materializePatientReminderDeliveries({
      ...input,
      targets: { selectedChannels: ['telegram'] as const },
    });
    expect(deliveries).toEqual([]);
  });

  it('preserves the canonical warmup default copy', () => {
    const deliveries = materializePatientReminderDeliveries({
      ...input,
      rule: { ...input.rule, customTitle: null, customText: null, displayTitle: null },
      targets: { selectedChannels: ['telegram'] as const, telegramId: '1001' },
    });
    expect(deliveries[0]?.intent.payload).toEqual(
      expect.objectContaining({ message: { text: '<b>Разминка ⚡</b>' } }),
    );
  });

  it('prefers the linked published content title when custom copy is absent', () => {
    const deliveries = materializePatientReminderDeliveries({
      ...input,
      rule: { ...input.rule, customTitle: null, customText: null, displayTitle: null },
      linkedTitle: 'Моя разминка для шеи',
      targets: { selectedChannels: ['telegram'] as const, telegramId: '1001' },
    });
    expect(deliveries[0]?.intent.payload).toEqual(
      expect.objectContaining({ message: { text: '<b>Моя разминка для шеи</b>' } }),
    );
  });
});
