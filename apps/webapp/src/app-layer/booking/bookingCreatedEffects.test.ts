import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBookingCreatedEffects } from './bookingCreatedEffects';
import {
  registerEmptyAudienceReporter,
  resetEmptyAudienceReporterForTests,
} from '@/modules/operator-alerts/emptyAudienceRuntime';
import type { BookingCreatedEffectsInput } from '@/modules/booking-notifications/bookingCreatedEffectsPort';

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
        getTargets: async () => ({ channelBindings: { telegramId: '111', maxId: '222' } }),
      },
    });

    await effects.apply(input());

    expect(enqueued.map((row) => row.channel)).toEqual(['telegram', 'max']);
    expect(enqueued.map((row) => row.recipient)).toEqual(['111', '222']);
    for (const row of enqueued) {
      expect((row.content as { text: string }).text).toBe(
        'Запись подтверждена: 10 мар. 2027 г., 12:00\nОнлайн',
      );
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
        getTargets: async () => ({ channelBindings: { telegramId: '111' } }),
      },
    });

    await effects.apply(input());
    await effects.apply(input());

    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });

  it('нет ни одного привязанного канала — это инцидент, а не тихий успех', async () => {
    const reported: Array<{ topic: string; context?: Record<string, unknown> }> = [];
    registerEmptyAudienceReporter(async (event) => {
      reported.push({ topic: event.topic, ...(event.context ? { context: event.context } : {}) });
    });
    const effects = createBookingCreatedEffects({
      outboundMessageQueue: { enqueue: async () => true },
      deliveryTargets: { getTargets: async () => ({ channelBindings: {} }) },
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
        getTargets: async () => ({ channelBindings: { telegramId: '111' } }),
      },
    });

    await expect(effects.apply(input())).resolves.toBeUndefined();
    expect(reported).toEqual(['enqueue_failed']);
  });

  it('клиника выключила уведомление пациента — в очередь не уходит ничего', async () => {
    const enqueue = vi.fn(async () => true);
    const getTargets = vi.fn(async () => ({ channelBindings: { telegramId: '111' } }));
    const effects = createBookingCreatedEffects({
      outboundMessageQueue: { enqueue },
      deliveryTargets: { getTargets },
    });

    await effects.apply(input({ notifyPatient: false }));

    expect(enqueue).not.toHaveBeenCalled();
    expect(getTargets).not.toHaveBeenCalled();
  });
});
