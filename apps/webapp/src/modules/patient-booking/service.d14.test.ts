import { describe, expect, it, vi } from 'vitest';
import { createPatientBookingService } from './service';
import type { PatientBookingRecord } from './types';

/**
 * D14, часть 4: пациентские отмена/перенос (в отличие от врачебных — те уже покрыты D14 частями 1-2)
 * должны слать `cancelPendingReminders`, `patientPushVariant` и `patientMessageText` в событие
 * интегратора. До этой правки `cancelBooking` не клал ни одно из трёх полей.
 */

function fakeRecord(overrides: Partial<PatientBookingRecord> = {}): PatientBookingRecord {
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
    ...overrides,
  };
}

function fakeAppointment() {
  return {
    id: 'appt-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    roomId: null,
    specialistId: 'specialist-1',
    serviceId: 'service-1',
    platformUserId: 'user-1',
    startAt: '2027-03-10T09:00:00.000Z',
    endAt: '2027-03-10T09:30:00.000Z',
    durationMinutes: 30,
    source: 'native' as const,
    status: 'confirmed' as const,
    originalStartAt: null,
    rescheduleCount: 0,
    paymentRef: null,
    packageUsageRef: null,
    phoneNormalized: '+79990000000',
    attributionJson: {},
  };
}

function buildService(input: {
  events: Array<Record<string, unknown>>;
  getAppDisplayTimeZone?: () => Promise<string>;
  getBookingLifecycleNotificationSettings?: Parameters<
    typeof createPatientBookingService
  >[0]['getBookingLifecycleNotificationSettings'];
  memberships?: Parameters<typeof createPatientBookingService>[0]['memberships'];
}) {
  const record = fakeRecord();
  const bookingsPort = {
    getByIdForUser: vi.fn(async () => record),
    markCancelling: vi.fn(async () => record),
    markCancelled: vi.fn(async () => record),
    updateSlotsAfterReschedule: vi.fn(async () => record),
  };
  const bookingEngine = {
    getAppointment: vi.fn(async () => fakeAppointment()),
  };
  const appointmentLifecycle = {
    previewPatientCancel: vi.fn(async () => ({
      ok: true as const,
      allowed: true,
      isFree: true,
      requiresStaffConfirmation: false,
      messageKey: 'free',
    })),
    patientCancel: vi.fn(async () => ({
      ok: true as const,
      appointment: fakeAppointment(),
      eligibility: { isFree: true, decisionType: 'free', requiresStaffConfirmation: false },
      cancelPolicy: { notifyPatient: true, notifyStaff: true },
    })),
    previewPatientReschedule: vi.fn(async () => ({
      ok: true as const,
      allowed: true,
      requiresStaffConfirmation: false,
      remainingSelfReschedules: 1,
      messageKey: 'ok',
    })),
    patientReschedule: vi.fn(async () => ({
      ok: true as const,
      appointment: fakeAppointment(),
      reschedulePolicy: { notifyPatient: true, notifyStaff: true },
    })),
    patchLatestCancellationNotifications: vi.fn(async () => undefined),
    patchLatestRescheduleNotifications: vi.fn(async () => undefined),
  };
  const bookingScheduling = {
    assertSlotAvailable: vi.fn(async () => undefined),
  };

  const service = createPatientBookingService({
    // Постановка письма в очередь: в этих тестах доставка не проверяется, но порт обязателен —
    // запись без пути доставки подтверждения неполна, поэтому он не необязательный.
    outboundMessageQueue: { enqueue: async () => true },
    bookingsPort: bookingsPort as unknown as Parameters<typeof createPatientBookingService>[0]['bookingsPort'],
    syncPort: {
      emitBookingEvent: async (evt: unknown) => {
        input.events.push((evt as { payload: Record<string, unknown> }).payload);
      },
    } as unknown as Parameters<typeof createPatientBookingService>[0]['syncPort'],
    bookingEngine: bookingEngine as unknown as Parameters<typeof createPatientBookingService>[0]['bookingEngine'],
    bookingScheduling: bookingScheduling as unknown as Parameters<typeof createPatientBookingService>[0]['bookingScheduling'],
    appointmentLifecycle: appointmentLifecycle as unknown as Parameters<typeof createPatientBookingService>[0]['appointmentLifecycle'],
    ...(input.getAppDisplayTimeZone ? { getAppDisplayTimeZone: input.getAppDisplayTimeZone } : {}),
    ...(input.getBookingLifecycleNotificationSettings
      ? { getBookingLifecycleNotificationSettings: input.getBookingLifecycleNotificationSettings }
      : {}),
    ...(input.memberships ? { memberships: input.memberships } : {}),
  });
  return service;
}

describe('D14: пациентская отмена шлёт cancelPendingReminders/patientPushVariant/patientMessageText', () => {
  it('cancelBooking кладёт все три поля', async () => {
    const events: Array<Record<string, unknown>> = [];
    const service = buildService({ events, getAppDisplayTimeZone: async () => 'Europe/Moscow' });

    const result = await service.cancelBooking({ userId: 'user-1', bookingId: 'booking-1' });

    expect(result.ok).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0]!.cancelPendingReminders).toBe(true);
    expect(events[0]!.patientPushVariant).toBe('cancelled');
    expect(events[0]!.patientMessageText).toBe('Запись на 10 мар. 2027 г., 12:00 отменена.');
  });

  it('регрессия: если поля пропадут, тест краснеет', async () => {
    const events: Array<Record<string, unknown>> = [];
    const service = buildService({ events });

    await service.cancelBooking({ userId: 'user-1', bookingId: 'booking-1' });

    expect(events[0]!.cancelPendingReminders).toBe(true);
    expect(events[0]!.patientPushVariant).toBe('cancelled');
    expect(typeof events[0]!.patientMessageText).toBe('string');
  });
});

describe('D14: пациентский перенос шлёт cancelPendingReminders/patientPushVariant/patientMessageText', () => {
  it('rescheduleBooking кладёт все три поля', async () => {
    const events: Array<Record<string, unknown>> = [];
    const service = buildService({ events, getAppDisplayTimeZone: async () => 'Europe/Moscow' });

    const result = await service.rescheduleBooking({
      userId: 'user-1',
      bookingId: 'booking-1',
      slotStart: '2027-03-11T09:00:00.000Z',
      slotEnd: '2027-03-11T09:30:00.000Z',
    });

    expect(result.ok).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0]!.cancelPendingReminders).toBe(true);
    expect(events[0]!.patientPushVariant).toBe('rescheduled');
    expect(events[0]!.patientMessageText).toBe(
      'Запись перенесена на 11 мар. 2027 г., 12:00\nОчный приём',
    );
  });
});

describe('D14, часть 5: пациентская отмена/перенос шлёт doctorNotify/doctorMessageText/calendarAction/calendarTitleMarker', () => {
  it('cancelBooking кладёт врачебный текст и действие/пометку календаря', async () => {
    const events: Array<Record<string, unknown>> = [];
    const service = buildService({ events, getAppDisplayTimeZone: async () => 'Europe/Moscow' });

    await service.cancelBooking({ userId: 'user-1', bookingId: 'booking-1' });

    expect(events[0]!.doctorNotify).toBe(true);
    expect(typeof events[0]!.doctorMessageText).toBe('string');
    expect(events[0]!.calendarAction).toBe('updated');
    expect(events[0]!.calendarTitleMarker).toBe('cancelled');
  });

  it('rescheduleBooking кладёт врачебный текст и действие/пометку календаря', async () => {
    const events: Array<Record<string, unknown>> = [];
    const service = buildService({ events, getAppDisplayTimeZone: async () => 'Europe/Moscow' });

    await service.rescheduleBooking({
      userId: 'user-1',
      bookingId: 'booking-1',
      slotStart: '2027-03-11T09:00:00.000Z',
      slotEnd: '2027-03-11T09:30:00.000Z',
    });

    expect(events[0]!.doctorNotify).toBe(true);
    expect(typeof events[0]!.doctorMessageText).toBe('string');
    expect(events[0]!.calendarAction).toBe('updated');
    expect(events[0]!.calendarTitleMarker).toBe('none');
  });
});

describe('пациентский lifecycle не ломается на post-commit эффектах', () => {
  it('отмена без пакета не вызывает package outcome', async () => {
    const events: Array<Record<string, unknown>> = [];
    const applyCancelPackageOutcome = vi.fn(async () => ({ ok: true as const }));
    const service = buildService({
      events,
      memberships: { applyCancelPackageOutcome } as unknown as Parameters<
        typeof createPatientBookingService
      >[0]['memberships'],
    });

    const result = await service.cancelBooking({ userId: 'user-1', bookingId: 'booking-1' });

    expect(result.ok).toBe(true);
    expect(applyCancelPackageOutcome).not.toHaveBeenCalled();
  });

  it('ошибка чтения настроек не превращает выполненную отмену в API-ошибку', async () => {
    const events: Array<Record<string, unknown>> = [];
    const service = buildService({
      events,
      getBookingLifecycleNotificationSettings: async () => {
        throw new Error('settings_unavailable');
      },
    });

    const result = await service.cancelBooking({ userId: 'user-1', bookingId: 'booking-1' });

    expect(result.ok).toBe(true);
    expect(events).toHaveLength(1);
  });

  it('ошибка чтения настроек не превращает выполненный перенос в API-ошибку', async () => {
    const events: Array<Record<string, unknown>> = [];
    const service = buildService({
      events,
      getBookingLifecycleNotificationSettings: async () => {
        throw new Error('settings_unavailable');
      },
    });

    const result = await service.rescheduleBooking({
      userId: 'user-1',
      bookingId: 'booking-1',
      slotStart: '2027-03-11T09:00:00.000Z',
      slotEnd: '2027-03-11T09:30:00.000Z',
    });

    expect(result.ok).toBe(true);
    expect(events).toHaveLength(1);
  });
});
