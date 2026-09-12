import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBookingCreatedEffects } from './bookingCreatedEffects';
import {
  registerEmptyAudienceReporter,
  resetEmptyAudienceReporterForTests,
} from '@/modules/operator-alerts/emptyAudienceRuntime';
import type { BookingCreatedEffectsInput } from '@/modules/booking-notifications/bookingCreatedEffectsPort';
import { NOTIFICATION_TOPIC_APPOINTMENT } from '@/modules/patient-notifications/notificationTopicCodes';
import { getDeliveryTargetsForIntegrator } from '@/modules/integrator/deliveryTargetsApi';
import { resolvePatientTerms } from '@/modules/system-settings/patientTerms';

/**
 * Проверяется одно: ПОЛУЧИТ ЛИ ЧЕЛОВЕК сообщение о своей записи и по какому маршруту. Не форма
 * события, не число полей — что попало в очередь доставки, из которой пациенту отправит воркер.
 */

vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withExplicitOrganizationPrincipal: <T>(_ctx: unknown, fn: () => Promise<T>) => fn(),
}));

function input(overrides: Partial<BookingCreatedEffectsInput> = {}): BookingCreatedEffectsInput {
  return {
    organizationId: 'org-1',
    bookingId: 'booking-1',
    canonicalAppointmentId: 'appt-1',
    platformUserId: 'user-1',
    contactName: 'Пациент',
    contactPhone: '+79990000000',
    slotStart: '2027-03-10T09:00:00.000Z',
    slotEnd: '2027-03-10T09:30:00.000Z',
    bookingType: 'online',
    city: null,
    cityCodeSnapshot: null,
    notifyPatient: true,
    timeZone: 'Europe/Moscow',
    // Слово организации приходит тем же путём, что в продукте — через резолвер, а не литералом.
    appointmentTerms: resolvePatientTerms({ appointmentLabel: undefined }),
    ...overrides,
  };
}

describe('пациент узнаёт о созданной записи', () => {
  beforeEach(() => {
    resetEmptyAudienceReporterForTests();
  });

  it('получает сообщение в каждый привязанный мессенджер, и текст — тот же, что слал интегратор', async () => {
    const enqueued: Array<Record<string, unknown>> = [];
    const effects = createBookingCreatedEffects({
      outboundMessageQueue: {
        enqueue: async (context) => {
          enqueued.push(context as unknown as Record<string, unknown>);
          return true;
        },
      },
      deliveryTargets: {
        getTargets: async () => ({
          platformUserId: 'user-1',
          channelBindings: { telegramId: '111', maxId: '222' },
        }),
      },
    });

    await effects.apply(input());

    expect(enqueued.map((row) => row.channel)).toEqual(['telegram', 'max']);
    expect(enqueued.map((row) => row.recipient)).toEqual(['111', '222']);
    for (const row of enqueued) {
      expect((row.content as { text: string }).text).toBe(
        'Запись подтверждена: 10 мар. 2027 г., 12:00\nОнлайн',
      );
      expect((row.content as { senderScope?: string }).senderScope).toBe('clinic_if_configured');
    }
  });

  it('повтор события не приводит ко второму сообщению: ключ идемпотентности тот же', async () => {
    const keys: string[] = [];
    const effects = createBookingCreatedEffects({
      outboundMessageQueue: {
        enqueue: async (context) => {
          keys.push(`${context.purpose}:${context.idempotencyKey}`);
          return true;
        },
      },
      deliveryTargets: {
        getTargets: async () => ({
          platformUserId: 'user-1',
          channelBindings: { telegramId: '111' },
        }),
      },
    });

    await effects.apply(input());
    await effects.apply(input());

    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });

  it('повтор awaiting-payment события сохраняет один ключ очереди', async () => {
    const keys: string[] = [];
    const effects = createBookingCreatedEffects({
      outboundMessageQueue: {
        enqueue: async (context) => {
          keys.push(`${context.purpose}:${context.idempotencyKey}`);
          return true;
        },
      },
      deliveryTargets: {
        getTargets: async () => ({
          platformUserId: 'user-1',
          channelBindings: { telegramId: '111' },
          resolution: {
            userId: 'user-1',
            topicCode: NOTIFICATION_TOPIC_APPOINTMENT,
            selectedChannels: ['telegram'],
            skippedChannels: [],
            availableChannels: ['telegram'],
            enabledChannels: ['telegram'],
          },
        }),
      },
    });
    const awaitingPayment = {
      checkoutUrl: 'https://checkout.example.test/intent-retry',
      paymentDeadlineAt: '2027-03-10T10:00:00.000Z',
    };

    await effects.apply(input({ awaitingPayment }));
    await effects.apply(input({ awaitingPayment }));

    expect(new Set(keys).size).toBe(1);
  });

  it('нет ни одного привязанного канала — это инцидент, а не тихий успех', async () => {
    const reported: Array<{ topic: string; context?: Record<string, unknown> }> = [];
    registerEmptyAudienceReporter(async (event) => {
      reported.push({ topic: event.topic, ...(event.context ? { context: event.context } : {}) });
    });
    const effects = createBookingCreatedEffects({
      outboundMessageQueue: { enqueue: async () => true },
      deliveryTargets: {
        getTargets: async () => ({ platformUserId: 'user-1', channelBindings: {} }),
      },
    });

    await effects.apply(input());

    expect(reported).toHaveLength(1);
    expect(reported[0]!.topic).toBe('booking_created_patient_message');
    expect(reported[0]!.context?.reason).toBe('no_channel_bindings');
  });

  it('отказ постановки в очередь не роняет запись, но и не молчит', async () => {
    const reported: string[] = [];
    registerEmptyAudienceReporter(async (event) => {
      reported.push(String(event.context?.reason ?? ''));
    });
    const effects = createBookingCreatedEffects({
      outboundMessageQueue: {
        enqueue: async () => {
          throw new Error('permission denied for function enqueue_outbound_message');
        },
      },
      deliveryTargets: {
        getTargets: async () => ({
          platformUserId: 'user-1',
          channelBindings: { telegramId: '111' },
        }),
      },
    });

    await expect(effects.apply(input())).resolves.toBeUndefined();
    expect(reported).toEqual(['enqueue_failed']);
  });

  it('клиника выключила уведомление пациента — в очередь не уходит ничего', async () => {
    const enqueue = vi.fn(async () => true);
    const getTargets = vi.fn(async () => ({
      platformUserId: 'user-1',
      channelBindings: { telegramId: '111' },
    }));
    const effects = createBookingCreatedEffects({
      outboundMessageQueue: { enqueue },
      deliveryTargets: { getTargets },
    });

    await effects.apply(input({ notifyPatient: false }));

    expect(enqueue).not.toHaveBeenCalled();
    expect(getTargets).not.toHaveBeenCalled();
  });

  it('платёжная ссылка приходит только в каналы, подтверждённые общим резолвером', async () => {
    const paymentUrl = 'https://checkout.example.test/intent-1';
    const paymentDeadlineAt = '2027-03-10T10:00:00.000Z';
    const enqueued: Array<Record<string, unknown>> = [];
    const targetQueries: Array<Record<string, unknown>> = [];
    const effects = createBookingCreatedEffects({
      outboundMessageQueue: {
        enqueue: async (context) => {
          enqueued.push(context as unknown as Record<string, unknown>);
          return true;
        },
      },
      deliveryTargets: {
        getTargets: async (params) => {
          targetQueries.push(params);
          return {
            platformUserId: 'user-1',
            channelBindings: { telegramId: '111' },
            emailRecipient: 'verified@example.test',
            resolution: {
              userId: 'user-1',
              topicCode: NOTIFICATION_TOPIC_APPOINTMENT,
              selectedChannels: ['web_push', 'telegram', 'email'],
              skippedChannels: [],
              availableChannels: ['web_push', 'telegram', 'email'],
              enabledChannels: ['web_push', 'telegram', 'email'],
            },
          };
        },
      },
    });

    await effects.apply(input({ awaitingPayment: { checkoutUrl: paymentUrl, paymentDeadlineAt } }));

    expect(targetQueries[0]?.topic).toBe(NOTIFICATION_TOPIC_APPOINTMENT);
    expect(enqueued.map((row) => row.channel)).toEqual(['telegram', 'email', 'web_push']);
    expect(enqueued.map((row) => row.recipient)).toEqual([
      '111',
      'verified@example.test',
      'user-1',
    ]);
    const expectedDeadline = new Intl.DateTimeFormat('ru-RU', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Europe/Moscow',
    }).format(new Date(paymentDeadlineAt));
    for (const row of enqueued) {
      const content = row.content as { text: string };
      expect(content.text).toContain(paymentUrl);
      expect(content.text).toContain(expectedDeadline);
    }
  });

  it('не отправляет на неподтверждённый email и не создаёт инцидент при пустой аудитории', async () => {
    const enqueued: Array<Record<string, unknown>> = [];
    const reported: string[] = [];
    registerEmptyAudienceReporter(async (event) => {
      reported.push(event.topic);
    });
    const effects = createBookingCreatedEffects({
      outboundMessageQueue: {
        enqueue: async (context) => {
          enqueued.push(context as unknown as Record<string, unknown>);
          return true;
        },
      },
      deliveryTargets: {
        getTargets: async () => ({
          platformUserId: 'user-1',
          channelBindings: {},
          // This value must not become a delivery fallback: the resolver did not select email.
          emailRecipient: 'unverified@example.test',
          resolution: {
            userId: 'user-1',
            topicCode: NOTIFICATION_TOPIC_APPOINTMENT,
            selectedChannels: [],
            skippedChannels: [{ channel: 'email', reason: 'email_not_verified' }],
            availableChannels: [],
            enabledChannels: [],
          },
        }),
      },
    });

    await effects.apply(
      input({
        awaitingPayment: {
          checkoutUrl: 'https://checkout.example.test/intent-unverified',
          paymentDeadlineAt: '2027-03-10T10:00:00.000Z',
        },
      }),
    );

    expect(enqueued).toEqual([]);
    expect(reported).toEqual([]);
  });

  /**
   * PAY-APPT-09 / owner 11.09: a form-entered or otherwise unconfirmed email must never receive
   * a payment link. Unlike the neighbouring fixture, this runs the real channel resolver before
   * the real delivery effect, so a regression in either half reaches the observable queue.
   */
  it('не ставит платёжную ссылку на email, который реальный резолвер считает неподтверждённым', async () => {
    const resolved = await getDeliveryTargetsForIntegrator(
      {
        organizationId: 'org-1',
        platformUserId: 'user-1',
        topic: NOTIFICATION_TOPIC_APPOINTMENT,
      },
      {
        integratorDeliveryTargets: {
          readSnapshot: async () => ({
            ok: true,
            platformUserId: 'user-1',
            channelPreferences: [],
            topicChannelRows: [],
            emailRecipient: 'booking-form@example.test',
            emailVerified: false,
            muted: false,
            topicMasterEnabled: true,
            hasWebPushSubscription: false,
            vapidConfigured: true,
            smtpConfigured: true,
          }),
        },
      },
    );
    const enqueued: Array<Record<string, unknown>> = [];
    const effects = createBookingCreatedEffects({
      outboundMessageQueue: {
        enqueue: async (context) => {
          enqueued.push(context as unknown as Record<string, unknown>);
          return true;
        },
      },
      deliveryTargets: { getTargets: async () => resolved },
    });

    await effects.apply(
      input({
        awaitingPayment: {
          checkoutUrl: 'https://checkout.example.test/intent-unverified-resolved',
          paymentDeadlineAt: '2027-03-10T10:00:00.000Z',
        },
      }),
    );

    expect(enqueued).toEqual([]);
  });
});
