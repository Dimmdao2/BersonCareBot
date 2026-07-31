import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/system-settings/appDisplayTimezone', () => ({
  getAppDisplayTimeZone: vi.fn(async () => 'Europe/Moscow'),
}));

import { applyStaffRescheduleSideEffects } from './staffAppointmentLifecycleEffects';
import type { BeAppointment } from '@/modules/booking-engine/types';
import type { BookingSyncPort } from '@/modules/patient-booking/ports';

/**
 * D13a(добор): персонал переносит запись (manual-reschedule, admin и doctor маршруты
 * оба идут через applyStaffRescheduleSideEffects → emitStaffCanonicalBookingEvent).
 * До этой правки reminderPlan никуда не передавался — интегратор переставлял
 * напоминания по своим 24ч/2ч, игнорируя настройки клиники.
 */
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
    rescheduleCount: 1,
    paymentRef: null,
    packageUsageRef: null,
    phoneNormalized: '+79990000000',
    attributionJson: { contact_name: 'Пациент' },
  };
}

describe('applyStaffRescheduleSideEffects: reminderPlan', () => {
  let captured: Array<Record<string, unknown>>;
  let syncPort: BookingSyncPort;
  let lifecycle: {
    patchLatestRescheduleNotifications: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    captured = [];
    syncPort = {
      emitBookingEvent: vi.fn(async (evt) => {
        captured.push((evt as { payload: Record<string, unknown> }).payload);
      }),
    } as unknown as BookingSyncPort;
    lifecycle = {
      patchLatestRescheduleNotifications: vi.fn(async () => undefined),
    };
  });

  it('передаёт присланный reminderPlan в событие booking.rescheduled', async () => {
    await applyStaffRescheduleSideEffects({
      projection: null,
      lifecycle: lifecycle as never,
      organizationId: 'org-1',
      appointment: fakeAppointment(),
      reschedulePolicy: { notifyPatient: true, notifyStaff: true } as never,
      syncPort,
      reminderPlan: { enabled: true, offsetsMinutes: [45] },
    });

    expect(captured[0]!.reminderPlan).toEqual({ enabled: true, offsetsMinutes: [45] });
  });

  it('регрессия: если reminderPlan пропадёт из вызова emitStaffCanonicalBookingEvent, тест краснеет', async () => {
    await applyStaffRescheduleSideEffects({
      projection: null,
      lifecycle: lifecycle as never,
      organizationId: 'org-1',
      appointment: fakeAppointment(),
      reschedulePolicy: { notifyPatient: true, notifyStaff: true } as never,
      syncPort,
      reminderPlan: { enabled: false, offsetsMinutes: [] },
    });

    expect(captured[0]).toHaveProperty('reminderPlan');
    expect(captured[0]!.reminderPlan).toEqual({ enabled: false, offsetsMinutes: [] });
  });
});
