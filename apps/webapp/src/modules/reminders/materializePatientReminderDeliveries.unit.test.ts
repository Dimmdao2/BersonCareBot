import { describe, expect, it } from 'vitest';
import { materializePatientReminderDeliveries } from './materializePatientReminderDeliveries';
import {
  buildAppointmentLifecyclePushCopy,
  buildNewsPushCopy,
} from '@/modules/web-push/pushNotificationCopy';

const input = {
  rule: {
    id: 'rule-1',
    organizationId: 'd0000000-0000-4000-8000-00000000000d',
    platformUserId: 'a0000000-0000-4000-8000-00000000000a',
    category: 'warmup',
    linkedObjectType: 'content_section',
    linkedObjectId: 'warmups',
    customTitle: null,
    customText: null,
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
    for (const delivery of deliveries) {
      expect(delivery.intent.meta).toMatchObject({
        eventId: delivery.eventId,
        source: delivery.channel,
        outboundMessageClass: 'routine_product',
        outboundCapability:
          delivery.channel === 'web_push' ? 'app_push' : 'essential_delivery',
      });
      expect(delivery.intent.meta).not.toHaveProperty('userId');
      expect(Number.isNaN(Date.parse(delivery.intent.meta.occurredAt))).toBe(false);
      expect(delivery.intent.payload).toMatchObject({
        message: { text: expect.any(String) },
        delivery: {
          channels: [delivery.channel],
          maxAttempts: 1,
          ...(delivery.channel === 'telegram' || delivery.channel === 'max'
            ? { senderScope: 'clinic_if_configured' }
            : {}),
        },
      });
      const recipient = delivery.intent.payload.recipient as Record<string, unknown>;
      const recipientKey = {
        telegram: 'chatId',
        max: 'userId',
        vk: 'userId',
        email: 'email',
        web_push: 'pushUserId',
      }[delivery.channel];
      expect(recipient[recipientKey]).toBe(delivery.externalId);
    }
  });

  it('keeps patient-authored reminder text private while every external channel gets a neutral signal and app link', () => {
    const privateTitle = 'Диагноз: секретный заголовок';
    const privateText = 'Секретная схема лечения';
    const openUrl = 'https://test.example/app/patient/reminders?from=reminder';
    const deliveries = materializePatientReminderDeliveries({
      ...input,
      rule: {
        ...input.rule,
        category: 'exercise',
        linkedObjectType: 'custom',
        linkedObjectId: null,
        customTitle: privateTitle,
        customText: privateText,
        reminderIntent: 'generic',
        notificationTopicCode: 'training_reminders',
      },
      targets: {
        selectedChannels: ['telegram', 'max', 'vk', 'email', 'web_push'] as const,
        telegramId: '1001',
        maxId: 'max-1',
        vkId: 'vk-1',
        emailRecipient: 'patient@example.test',
      },
    });

    expect(deliveries.map((delivery) => delivery.channel)).toEqual([
      'telegram',
      'max',
      'vk',
      'email',
      'web_push',
    ]);
    for (const delivery of deliveries) {
      const externalEnvelope = JSON.stringify({
        logText: delivery.logText,
        payload: delivery.intent.payload,
      });
      expect(externalEnvelope).not.toContain(privateTitle);
      expect(externalEnvelope).not.toContain(privateText);
      expect(externalEnvelope.toLocaleLowerCase('ru-RU')).toContain('напомин');
      expect(externalEnvelope).toContain(openUrl);
    }
  });

  it('owns copy, deep-link and callback keyboard before enqueue', () => {
    const deliveries = materializePatientReminderDeliveries(input);
    const telegram = deliveries.find((delivery) => delivery.channel === 'telegram');
    expect(telegram?.intent.payload).toEqual(
      expect.objectContaining({
        message: { text: '<b>Разминка ⚡</b>' },
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

  it('keeps doctor-generated lesson copy complete', () => {
    const deliveries = materializePatientReminderDeliveries({
      ...input,
      rule: {
        ...input.rule,
        category: 'exercise',
        linkedObjectType: 'rehab_program',
        linkedObjectId: 'program-1',
        reminderIntent: 'exercises',
        notificationTopicCode: 'training_reminders',
      },
      linkedTitle: 'Занятие: полный комплекс для спины',
      targets: { selectedChannels: ['telegram'] as const, telegramId: '1001' },
    });

    expect(deliveries[0]?.intent.payload).toEqual(
      expect.objectContaining({ message: { text: '<b>Занятие: полный комплекс для спины</b>' } }),
    );
  });

  it('keeps appointment and broadcast copy complete outside the private-reminder boundary', () => {
    expect(
      buildAppointmentLifecyclePushCopy(
        'created',
        '2026-09-02T12:00:00.000Z',
        'Europe/Moscow',
      ),
    ).toEqual({
      title: 'Запись на приём',
      body: 'Вы записаны на приём 2 сент. 2026 г., 15:00',
    });

    const broadcast = 'Клиника работает в субботу до 18:00 — запись открыта';
    expect(buildNewsPushCopy(broadcast)).toEqual({ title: 'Новости', body: broadcast });
  });
});
