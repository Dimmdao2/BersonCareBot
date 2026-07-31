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
      loadReminderPlan: vi.fn(async () => ({ enabled: true, offsetsMinutes: [] })),
      bookingSync: {
        emitBookingEvent: vi.fn(async (evt) => {
          captured.push((evt as { payload: Record<string, unknown> }).payload);
        }),
      },
    });

    await handler({ appointmentId: 'appt-1', paymentId: 'pay-1', platformUserId: 'user-1' });

    expect(captured).toHaveLength(1);
    expect(captured[0]!.patientMessageText).toBe(
      'Оплата записи подтверждена. 10 мар. 2027 г., 12:00',
    );
  });
});
