import { describe, expect, it } from 'vitest';
import { createBookingCalendarService } from './service';
import type { BookingCalendarPort } from './ports';
import type {
  CalendarAppointmentEvent,
  CalendarAppointmentPaymentView,
  CalendarFilterMeta,
} from './types';

/**
 * APPT-DETAIL-11 (решение владельца 2026-09-05): карточку деталей открывают из «Сегодня»
 * (`listAppointmentsInRange`, `getCalendar`) и из «Расписания» (`listAppointmentFeed`,
 * `getCalendar`). Досбор сведён в один чокпоинт сервиса именно затем, чтобы ни один из этих
 * путей не отдал событие без сводки оплаты.
 *
 * Что ломается без этой проверки: с любого одного пути снимают вызов `hydrate` — и на этом
 * хосте `event.payment` остаётся `null`, а `AppointmentPaymentSection` при `null` не рисуется
 * вовсе. Отказ молчаливый (ошибки нет, блок просто исчезает) и дорогой (врач не видит, оплачена
 * ли запись, и берёт деньги второй раз). Оракул — требование владельца, не реализация.
 */

const PAID_VIEW: CalendarAppointmentPaymentView = {
  prepaymentQuote: null,
  payment: { amountMinor: 10_000, status: 'succeeded' },
  totalMinor: 10_000,
  manualPaidMinor: 0,
  paymentsEntitled: true,
  onlinePaymentAvailable: false,
  patientChatAvailable: false,
};

function appointment(id: string): CalendarAppointmentEvent {
  return {
    kind: 'appointment',
    id,
    startAt: '2026-09-05T09:00:00.000Z',
    endAt: '2026-09-05T10:00:00.000Z',
    status: 'confirmed',
    source: 'canonical',
    specialistId: null,
    specialistName: null,
    branchId: null,
    branchTitle: null,
    branchColor: null,
    roomId: null,
    roomTitle: null,
    serviceId: null,
    serviceTitle: null,
    platformUserId: 'patient-1',
    patientName: null,
    patientPhone: null,
    bookingStatus: null,
    paymentStatus: null,
    prepaymentPending: false,
    packageUsageRef: null,
    packageTitle: null,
    packageDisplayNumber: null,
    rescheduleCount: 0,
    originalStartAt: null,
    formComments: [],
    // Репозиторий календаря сводку оплаты сформировать не может — её досбирает app-layer.
    primaryComment: 'Существующий комментарий',
    payment: null,
  };
}

const EMPTY_META: CalendarFilterMeta = {
  specialists: [],
  branches: [],
  rooms: [],
  services: [],
};

function createPort(): BookingCalendarPort {
  return {
    async listAppointmentsInRange() {
      return [appointment('appointment-1')];
    },
    async listAppointmentFeed() {
      return { items: [appointment('appointment-1')], total: 1, hasMore: false };
    },
    async listFilterMeta() {
      return EMPTY_META;
    },
  };
}

function createService() {
  return createBookingCalendarService({
    calendarPort: createPort(),
    listScheduleBlocks: async () => [],
    hydrateAppointmentDetails: async (_organizationId, events) =>
      events.map((event) => ({ ...event, payment: PAID_VIEW })),
  });
}

const FILTERS = {
  organizationId: 'org-1',
  rangeStart: '2026-09-05T00:00:00.000Z',
  rangeEnd: '2026-09-05T23:59:59.000Z',
  // Задан явно: иначе `getCalendar` пошёл бы за отображаемой таймзоной в базу, а проверяемое
  // здесь поведение — маршрутизация досбора, а не чтение настроек.
  timeZone: 'Europe/Moscow',
};

describe('booking calendar detail hydration reaches every host', () => {
  it('serves the payment summary through the range read used by the Today dashboard', async () => {
    const events = await createService().listAppointmentsInRange(FILTERS);

    expect(events[0]?.payment).toEqual(PAID_VIEW);
  });

  it('serves the payment summary through the feed read used by the Schedule tab', async () => {
    const page = await createService().listAppointmentFeed({ ...FILTERS, limit: 20, offset: 0 });

    expect(page.items[0]?.payment).toEqual(PAID_VIEW);
  });

  it('serves the payment summary through the aggregate read behind both calendar modals', async () => {
    const aggregate = await createService().getCalendar(FILTERS);
    const event = aggregate.events.find((candidate) => candidate.kind === 'appointment');

    expect(event?.kind).toBe('appointment');
    expect(event && 'payment' in event ? event.payment : null).toEqual(PAID_VIEW);
  });

  it('passes the caller organization to the hydrator instead of a foreign tenant', async () => {
    const seen: string[] = [];
    const service = createBookingCalendarService({
      calendarPort: createPort(),
      listScheduleBlocks: async () => [],
      hydrateAppointmentDetails: async (organizationId, events) => {
        seen.push(organizationId);
        return events;
      },
    });

    await service.listAppointmentsInRange(FILTERS);
    await service.listAppointmentFeed({ ...FILTERS, limit: 20, offset: 0 });
    await service.getCalendar(FILTERS);

    expect(seen).toEqual(['org-1', 'org-1', 'org-1']);
  });

  it('hydrates the whole range in one batch rather than once per appointment', async () => {
    const batchSizes: number[] = [];
    const service = createBookingCalendarService({
      calendarPort: {
        ...createPort(),
        async listAppointmentsInRange() {
          return ['a-1', 'a-2', 'a-3'].map(appointment);
        },
      },
      listScheduleBlocks: async () => [],
      hydrateAppointmentDetails: async (_organizationId, events) => {
        batchSizes.push(events.length);
        return events.map((event) => ({ ...event, payment: PAID_VIEW }));
      },
    });

    const events = await service.listAppointmentsInRange(FILTERS);

    expect(events.every((event) => event.payment === PAID_VIEW)).toBe(true);
    expect(batchSizes).toEqual([3]);
  });
});
