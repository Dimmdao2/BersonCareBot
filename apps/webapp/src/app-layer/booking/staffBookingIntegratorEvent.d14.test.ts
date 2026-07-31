import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/system-settings/appDisplayTimezone', () => ({
  getAppDisplayTimeZone: vi.fn(async () => 'Europe/Moscow'),
}));

import { emitStaffCanonicalBookingEvent } from './staffBookingIntegratorEvent';
import type { BeAppointment } from '@/modules/booking-engine/types';
import type { BookingSyncPort } from '@/modules/patient-booking/ports';

/**
 * D14, часть 4: врачебные отмена/no-show/перенос уже слали cancelPendingReminders и
 * patientPushVariant (части 1-2). Не хватало `patientMessageText` — интегратор по-прежнему
 * сочинял текст сам. Каждый вариант ниже обязан воспроизводить прежний текст интегратора.
 */

function fakeAppointment(overrides: Partial<BeAppointment> = {}): BeAppointment {
  return {
    id: 'appt-1',
    organizationId: 'org-1',
    branchId: null,
    roomId: null,
    specialistId: null,
    serviceId: null,
    platformUserId: 'user-1',
    startAt: '2027-03-10T09:00:00.000Z',
    endAt: '2027-03-10T09:30:00.000Z',
    durationMinutes: 30,
    source: 'native',
    status: 'confirmed',
    originalStartAt: null,
    rescheduleCount: 0,
    paymentRef: null,
    packageUsageRef: null,
    phoneNormalized: '+79990000000',
    attributionJson: { contact_name: 'Пациент' },
    ...overrides,
  };
}

describe('D14(3): врачебные события шлют patientMessageText', () => {
  let captured: Array<Record<string, unknown>>;
  let syncPort: BookingSyncPort;

  beforeEach(() => {
    captured = [];
    syncPort = {
      emitBookingEvent: vi.fn(async (evt) => {
        captured.push((evt as { payload: Record<string, unknown> }).payload);
      }),
    } as unknown as BookingSyncPort;
  });

  it('booking.cancelled: воспроизводит текст отмены интегратора', async () => {
    await emitStaffCanonicalBookingEvent({
      syncPort,
      eventType: 'booking.cancelled',
      appointment: fakeAppointment(),
      cancelPendingReminders: true,
      patientPushVariant: 'cancelled',
    });

    expect(captured[0]!.patientMessageText).toBe('Запись на 10 мар. 2027 г., 12:00 отменена.');
  });

  it('booking.rescheduled: воспроизводит текст переноса интегратора', async () => {
    await emitStaffCanonicalBookingEvent({
      syncPort,
      eventType: 'booking.rescheduled',
      appointment: fakeAppointment(),
      cancelPendingReminders: true,
      patientPushVariant: 'rescheduled',
    });

    expect(captured[0]!.patientMessageText).toBe(
      'Запись перенесена на 10 мар. 2027 г., 12:00\nОчный приём',
    );
  });

  it('регрессия: если patientMessageText пропадёт, тест краснеет', async () => {
    await emitStaffCanonicalBookingEvent({
      syncPort,
      eventType: 'booking.cancelled',
      appointment: fakeAppointment(),
    });

    expect(typeof captured[0]!.patientMessageText).toBe('string');
    expect((captured[0]!.patientMessageText as string).length).toBeGreaterThan(0);
  });
});

describe('D14, часть 5: врачебные события шлют doctorNotify/doctorMessageText/calendarAction/calendarTitleMarker', () => {
  let captured: Array<Record<string, unknown>>;
  let syncPort: BookingSyncPort;

  beforeEach(() => {
    captured = [];
    syncPort = {
      emitBookingEvent: vi.fn(async (evt) => {
        captured.push((evt as { payload: Record<string, unknown> }).payload);
      }),
    } as unknown as BookingSyncPort;
  });

  it('booking.created: doctorNotify передаётся дословно, календарь получает created/none', async () => {
    await emitStaffCanonicalBookingEvent({
      syncPort,
      eventType: 'booking.created',
      appointment: fakeAppointment(),
      doctorNotify: false,
    });

    expect(captured[0]!.doctorNotify).toBe(false);
    expect(typeof captured[0]!.doctorMessageText).toBe('string');
    expect(captured[0]!.calendarAction).toBe('created');
    expect(captured[0]!.calendarTitleMarker).toBe('none');
  });

  it('booking.cancelled: календарь получает updated/cancelled', async () => {
    await emitStaffCanonicalBookingEvent({
      syncPort,
      eventType: 'booking.cancelled',
      appointment: fakeAppointment(),
    });

    expect(captured[0]!.calendarAction).toBe('updated');
    expect(captured[0]!.calendarTitleMarker).toBe('cancelled');
  });
});
