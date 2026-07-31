import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/system-settings/appDisplayTimezone', () => ({
  getAppDisplayTimeZone: vi.fn(async () => 'Europe/Moscow'),
}));

import { emitStaffCanonicalBookingEvent } from './staffBookingIntegratorEvent';
import type { BeAppointment } from '@/modules/booking-engine/types';
import type { BookingSyncPort } from '@/modules/patient-booking/ports';

/** D13a(добор): reminderPlan должен доходить дословно до payload события, если передан вызывающим. */
function fakeAppointment(): BeAppointment {
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
  };
}

describe('emitStaffCanonicalBookingEvent: reminderPlan', () => {
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

  it('booking.rescheduled: reminderPlan уезжает в событие дословно', async () => {
    await emitStaffCanonicalBookingEvent({
      syncPort,
      eventType: 'booking.rescheduled',
      appointment: fakeAppointment(),
      cancelPendingReminders: true,
      patientPushVariant: 'rescheduled',
      reminderPlan: { enabled: true, offsetsMinutes: [15, 90] },
    });

    expect(captured[0]!.reminderPlan).toEqual({ enabled: true, offsetsMinutes: [15, 90] });
  });

  it('без reminderPlan поле в событии отсутствует (совместимость со старыми вызывающими)', async () => {
    await emitStaffCanonicalBookingEvent({
      syncPort,
      eventType: 'booking.cancelled',
      appointment: fakeAppointment(),
    });

    expect(captured[0]).not.toHaveProperty('reminderPlan');
  });
});
