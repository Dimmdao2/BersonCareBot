import { describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/system-settings/appDisplayTimezone', () => ({
  getAppDisplayTimeZone: vi.fn(async () => 'Europe/Moscow'),
}));

import { createAppointmentPaymentConfirmedHandler } from './appointmentPaymentConfirmedHandler';
import type { PatientBookingRecord } from '@/modules/patient-booking/types';

/**
 * D14, часть 4: `booking.payment_captured` тоже переносится — вебапп теперь строит
 * `patientMessageText` вместо интегратора (`Оплата записи подтверждена. <дата>`).
 */

function fakeRecord(): PatientBookingRecord {
  return {
    id: 'booking-1',
    organizationId: 'org-1',
    userId: 'user-1',
    bookingType: 'in_person',
    city: null,
    category: 'general',
    slotStart: '2027-03-10T09:00:00.000Z',
    slotEnd: '2027-03-10T09:30:00.000Z',
    status: 'confirmed',
    cancelledAt: null,
    cancelReason: null,
    gcalEventId: null,
    contactPhone: '+79990000000',
    contactEmail: null,
    contactName: 'Пациент',
    reminder24hSent: false,
    reminder2hSent: false,
    createdAt: '2027-03-01T00:00:00.000Z',
    updatedAt: '2027-03-01T00:00:00.000Z',
    branchServiceId: null,
    branchId: null,
    serviceId: null,
    cityCodeSnapshot: null,
    branchTitleSnapshot: null,
    serviceTitleSnapshot: null,
    durationMinutesSnapshot: 60,
    priceMinorSnapshot: null,
    canonicalAppointmentId: 'appt-1',
    provenanceCreatedBy: null,
    provenanceUpdatedBy: null,
  };
}

describe('D14(3): booking.payment_captured шлёт patientMessageText', () => {
  it('строит текст «Оплата записи подтверждена. <дата>»', async () => {
    const captured: Array<Record<string, unknown>> = [];
    const record = fakeRecord();
    const handler = createAppointmentPaymentConfirmedHandler({
      patientBookings: {
        markConfirmedByCanonicalAppointment: vi.fn(async () => record),
        getByCanonicalAppointmentId: vi.fn(async () => record),
      },
      bookingEngine: {
        getAppointment: vi.fn(async () => ({ organizationId: 'org-1' }) as never),
      },
      loadNotificationSettings: vi.fn(async () => null as never),
      bookingSync: {
        emitBookingEvent: vi.fn(async (evt) => {
          captured.push((evt as { payload: Record<string, unknown> }).payload);
        }),
      },
    });

    await handler({ appointmentIds: ['appt-1'], paymentId: 'pay-1', platformUserId: 'user-1' });

    expect(captured).toHaveLength(1);
    expect(captured[0]!.patientMessageText).toBe(
      'Оплата записи подтверждена. 10 мар. 2027 г., 12:00',
    );
  });
});

describe('D14, часть 5: booking.payment_captured шлёт doctorNotify/doctorMessageText/calendarAction/calendarTitleMarker', () => {
  it('строит врачебный текст и действие/пометку календаря', async () => {
    const captured: Array<Record<string, unknown>> = [];
    const record = fakeRecord();
    const handler = createAppointmentPaymentConfirmedHandler({
      patientBookings: {
        markConfirmedByCanonicalAppointment: vi.fn(async () => record),
        getByCanonicalAppointmentId: vi.fn(async () => record),
      },
      bookingEngine: {
        getAppointment: vi.fn(async () => ({ organizationId: 'org-1' }) as never),
      },
      loadNotificationSettings: vi.fn(async () => null as never),
      bookingSync: {
        emitBookingEvent: vi.fn(async (evt) => {
          captured.push((evt as { payload: Record<string, unknown> }).payload);
        }),
      },
    });

    await handler({ appointmentIds: ['appt-1'], paymentId: 'pay-1', platformUserId: 'user-1' });

    expect(captured[0]!.doctorNotify).toBe(true);
    expect(captured[0]!.doctorMessageText).toBe('Оплата записи: Пациент, 10 мар. 2027 г., 12:00');
    expect(captured[0]!.calendarAction).toBe('updated');
    expect(captured[0]!.calendarTitleMarker).toBe('none');
  });
});

describe('S8: одна оплата подтверждает все записи, но несёт одно сообщение', () => {
  it('отправляет два календарных события и только один текст для пациента и врача', async () => {
    const captured: Array<{ idempotencyKey: string; payload: Record<string, unknown> }> = [];
    const confirmed: string[] = [];
    const first = { ...fakeRecord(), serviceTitleSnapshot: 'Первичный приём' };
    const second = {
      ...fakeRecord(),
      id: 'booking-2',
      canonicalAppointmentId: 'appt-2',
      slotStart: '2027-03-11T09:00:00.000Z',
      slotEnd: '2027-03-11T09:30:00.000Z',
      serviceTitleSnapshot: 'Повторный приём',
    };
    const records = new Map([
      ['appt-1', first],
      ['appt-2', second],
    ]);
    const handler = createAppointmentPaymentConfirmedHandler({
      patientBookings: {
        markConfirmedByCanonicalAppointment: vi.fn(async (appointmentId) => {
          confirmed.push(appointmentId);
          return records.get(appointmentId) ?? null;
        }),
        getByCanonicalAppointmentId: vi.fn(
          async (appointmentId) => records.get(appointmentId) ?? null,
        ),
      },
      bookingEngine: {
        getAppointment: vi.fn(async () => ({ organizationId: 'org-1' }) as never),
      },
      loadNotificationSettings: vi.fn(async () => null as never),
      bookingSync: {
        emitBookingEvent: vi.fn(async (event) => {
          expect(confirmed).toEqual(['appt-1', 'appt-2']);
          captured.push(event as { idempotencyKey: string; payload: Record<string, unknown> });
        }),
      },
    });

    await handler({
      appointmentIds: ['appt-1', 'appt-2'],
      paymentId: 'pay-1',
      platformUserId: 'user-1',
    });

    expect(captured).toHaveLength(2);
    expect(captured.map(({ idempotencyKey }) => idempotencyKey)).toEqual([
      'booking.payment_captured:pay-1:appt-1',
      'booking.payment_captured:pay-1:appt-2',
    ]);
    expect(
      captured.filter(({ payload }) => typeof payload.patientMessageText === 'string'),
    ).toHaveLength(1);
    expect(
      captured.filter(({ payload }) => typeof payload.doctorMessageText === 'string'),
    ).toHaveLength(1);
    expect(captured[0]!.payload.patientMessageText).toContain('Первичный приём');
    expect(captured[0]!.payload.patientMessageText).toContain('Повторный приём');
    expect(captured[1]!.payload.patientMessageText).toBeUndefined();
    expect(captured[1]!.payload.doctorMessageText).toBeUndefined();
    expect(captured[1]!.payload.suppressPatientNotification).toBe(true);
    expect(captured[1]!.payload.doctorNotify).toBe(false);
  });

  // ТЕСТ АУДИТА СНЯТ ВЕДУЩИМ (F1 аудита S8). Он требовал событие и для того слота, чья проекция
  // НЕ подтвердилась. Такого требования нет ни в плане владельца, ни в поведении до S8: прежний
  // обработчик выходил ровно на том же условии (`if (!row || row.status !== 'confirmed') return`),
  // то есть кандидат ничего не сломал. По сути требование и неверно: `booking.payment_captured`
  // для неподтверждённой брони — ложь о её состоянии. Что неподтверждённая проекция навсегда
  // остаётся без календарного события — настоящий предсуществующий дефект, и он вынесен владельцу
  // вопросом в план, а не превращён в работу этого этапа.

  it('не начинает доставку, если метаданные второго слота загрузить не удалось', async () => {
    const captured: Array<Record<string, unknown>> = [];
    const first = fakeRecord();
    const second = {
      ...fakeRecord(),
      id: 'booking-2',
      canonicalAppointmentId: 'appt-2',
      slotStart: '2027-03-11T09:00:00.000Z',
    };
    const records = new Map([
      ['appt-1', first],
      ['appt-2', second],
    ]);
    const handler = createAppointmentPaymentConfirmedHandler({
      patientBookings: {
        markConfirmedByCanonicalAppointment: vi.fn(
          async (appointmentId) => records.get(appointmentId) ?? null,
        ),
        getByCanonicalAppointmentId: vi.fn(
          async (appointmentId) => records.get(appointmentId) ?? null,
        ),
      },
      bookingEngine: {
        getAppointment: vi.fn(async (appointmentId) => {
          if (appointmentId === 'appt-2') throw new Error('appointment_lookup_failed');
          return { organizationId: 'org-1' } as never;
        }),
      },
      loadNotificationSettings: vi.fn(async () => null as never),
      bookingSync: {
        emitBookingEvent: vi.fn(async (event) => {
          captured.push(event as Record<string, unknown>);
        }),
      },
    });

    await expect(
      handler({
        appointmentIds: ['appt-1', 'appt-2'],
        paymentId: 'pay-1',
        platformUserId: 'user-1',
      }),
    ).rejects.toThrow('appointment_lookup_failed');
    expect(captured).toEqual([]);
  });
  // F3 независимого аудита: у онлайн-записи снимка услуги нет по построению, и в письмо уезжал
  // внутренний ключ. Дорого и тихо: письмо уходит пациенту, а мы его не читаем. Тест держит
  // ровно это — что в тексте нет сырых ключей, — а не формулировку.
  it('не называет онлайн-приём внутренним ключом категории', async () => {
    const captured: Array<Record<string, unknown>> = [];
    const online = (id: string, category: 'rehab_lfk' | 'nutrition', slotStart: string) => ({
      ...fakeRecord(),
      id,
      bookingType: 'online' as const,
      category,
      serviceTitleSnapshot: null,
      slotStart,
      slotEnd: slotStart,
    });
    const records = new Map([
      ['appt-1', online('booking-1', 'rehab_lfk', '2027-03-10T09:00:00.000Z')],
      ['appt-2', online('booking-2', 'nutrition', '2027-03-11T09:00:00.000Z')],
    ]);
    const handler = createAppointmentPaymentConfirmedHandler({
      patientBookings: {
        markConfirmedByCanonicalAppointment: vi.fn(
          async (appointmentId) => records.get(appointmentId) ?? null,
        ),
        getByCanonicalAppointmentId: vi.fn(
          async (appointmentId) => records.get(appointmentId) ?? null,
        ),
      },
      bookingEngine: { getAppointment: vi.fn(async () => ({ organizationId: 'org-1' }) as never) },
      loadNotificationSettings: vi.fn(async () => null as never),
      bookingSync: {
        emitBookingEvent: vi.fn(async (event) => {
          captured.push((event as { payload: Record<string, unknown> }).payload);
        }),
      },
    });

    await handler({
      appointmentIds: ['appt-1', 'appt-2'],
      paymentId: 'pay-1',
      platformUserId: 'user-1',
    });

    const patientText = String(captured[0]!.patientMessageText ?? '');
    const doctorText = String(captured[0]!.doctorMessageText ?? '');
    for (const text of [patientText, doctorText]) {
      expect(text).not.toContain('rehab_lfk');
      expect(text).not.toContain('nutrition');
    }
    expect(patientText).toContain('Реабилитация (ЛФК)');
    expect(patientText).toContain('Нутрициология');
  });
});
