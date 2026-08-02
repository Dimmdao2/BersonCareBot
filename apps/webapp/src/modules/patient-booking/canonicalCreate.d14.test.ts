import { describe, expect, it, vi } from 'vitest';
import { createBookingOnCanonicalEngine, type CanonicalBookingDeps } from './canonicalCreate';
import type { CreatePatientBookingInput, PatientBookingRecord } from './types';

/**
 * D14, часть 4: вебапп при создании записи (`booking.created`) должен прислать интегратору
 * `cancelPendingReminders` и `patientMessageText` — раньше эти поля отсутствовали в событии,
 * и решение фактически принимал интегратор своими значениями по умолчанию.
 */

function fakeRecord(overrides: Partial<PatientBookingRecord> = {}): PatientBookingRecord {
  return {
    id: 'booking-1',
    organizationId: 'org-1',
    userId: 'user-1',
    bookingType: 'online',
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

function buildDeps(
  emitBookingEvent: (input: unknown) => Promise<void>,
  overrides: Partial<CanonicalBookingDeps> = {},
): CanonicalBookingDeps {
  const record = fakeRecord();
  const bookingsPort = {
    createPending: vi.fn(async () => record),
    markConfirmed: vi.fn(async () => record),
    markFailedSync: vi.fn(async () => undefined),
  };
  const bookingScheduling = {
    assertSlotAvailable: vi.fn(async () => undefined),
    getMaxConsecutiveSlotHours: vi.fn(async () => 8),
  };
  const bookingEngine = {
    createOnlineAppointmentsIfAvailable: vi.fn(async () => [
      {
        id: 'appt-1',
        organizationId: 'org-1',
        startAt: record.slotStart,
        endAt: record.slotEnd,
      },
    ]),
  };
  return {
    bookingsPort: bookingsPort as unknown as CanonicalBookingDeps['bookingsPort'],
    syncPort: { emitBookingEvent } as unknown as CanonicalBookingDeps['syncPort'],
    bookingEngine: bookingEngine as unknown as CanonicalBookingDeps['bookingEngine'],
    bookingScheduling: bookingScheduling as unknown as CanonicalBookingDeps['bookingScheduling'],
    bookingForm: null,
    appointmentProjection: null,
    payments: null,
    canAcceptBookingPrepayment: async () => false,
    memberships: null,
    clientHistory: null,
    ...overrides,
  };
}

const createInput: CreatePatientBookingInput = {
  type: 'online',
  userId: 'user-1',
  organizationId: 'org-1',
  category: 'general',
  slotStart: '2027-03-10T09:00:00.000Z',
  slotEnd: '2027-03-10T09:30:00.000Z',
  contactName: 'Пациент',
  contactPhone: '+79990000000',
};

describe('D14: booking.created отправляет cancelPendingReminders и patientMessageText', () => {
  it('кладёт cancelPendingReminders: true и текст подтверждения в тайзоне организации', async () => {
    const events: Array<Record<string, unknown>> = [];
    const deps = buildDeps(
      async (input) => {
        events.push((input as { payload: Record<string, unknown> }).payload);
      },
      { getAppDisplayTimeZone: async () => 'Europe/Moscow' },
    );

    await createBookingOnCanonicalEngine(deps, createInput);

    expect(events).toHaveLength(1);
    expect(events[0]!.cancelPendingReminders).toBe(true);
    expect(events[0]!.patientMessageText).toBe(
      'Запись подтверждена: 10 мар. 2027 г., 12:00\nОнлайн',
    );
  });

  it('регрессия: если вебапп перестанет класть patientMessageText, тест краснеет', async () => {
    const events: Array<Record<string, unknown>> = [];
    const deps = buildDeps(async (input) => {
      events.push((input as { payload: Record<string, unknown> }).payload);
    });

    await createBookingOnCanonicalEngine(deps, createInput);

    // Поломка «вебапп больше не шлёт текст» выглядела бы как `patientMessageText` === undefined.
    expect(typeof events[0]!.patientMessageText).toBe('string');
    expect((events[0]!.patientMessageText as string).length).toBeGreaterThan(0);
  });
});

describe('D14, часть 5: booking.created отправляет doctorNotify/doctorMessageText/calendarAction/calendarTitleMarker', () => {
  it('кладёт врачебный текст и действие/пометку календаря для нового события', async () => {
    const events: Array<Record<string, unknown>> = [];
    const deps = buildDeps(
      async (input) => {
        events.push((input as { payload: Record<string, unknown> }).payload);
      },
      { getAppDisplayTimeZone: async () => 'Europe/Moscow' },
    );

    await createBookingOnCanonicalEngine(deps, createInput);

    expect(events).toHaveLength(1);
    expect(events[0]!.doctorNotify).toBe(true);
    expect(typeof events[0]!.doctorMessageText).toBe('string');
    expect((events[0]!.doctorMessageText as string).length).toBeGreaterThan(0);
    expect(events[0]!.calendarAction).toBe('created');
    expect(events[0]!.calendarTitleMarker).toBe('none');
  });
});

describe('§5a/2.1c: booking prepayment is patient money, not the clinic tariff payment', () => {
  it('keeps an existing prepayment for a public booking while the clinic is read-only', async () => {
    const resolvePrepayment = vi.fn(async () => ({
      required: true,
      amountMinor: 5_000,
      currency: 'RUB',
    }));
    const createAppointmentPaymentIntent = vi.fn();
    const deps = buildDeps(async () => undefined, {
      payments: {
        resolvePrepayment,
        createAppointmentPaymentIntent,
      } as unknown as CanonicalBookingDeps['payments'],
      canAcceptBookingPrepayment: async () => true,
    });
    const bookingsPort = deps.bookingsPort as unknown as {
      markAwaitingPayment: ReturnType<typeof vi.fn>;
    };
    bookingsPort.markAwaitingPayment = vi.fn(async () => fakeRecord({ status: 'awaiting_payment' }));

    const result = await createBookingOnCanonicalEngine(deps, {
      ...createInput,
      bookingChannel: 'public_widget',
    });

    expect(result.status).toBe('awaiting_payment');
    expect(resolvePrepayment).toHaveBeenCalledOnce();
    expect(createAppointmentPaymentIntent).toHaveBeenCalledOnce();
  });

  it('confirms the booking without requesting or accepting prepayment when the mechanic is disabled', async () => {
    const resolvePrepayment = vi.fn(async () => ({
      required: true,
      amountMinor: 5_000,
      currency: 'RUB',
    }));
    const createAppointmentPaymentIntent = vi.fn();
    const deps = buildDeps(async () => undefined, {
      payments: {
        resolvePrepayment,
        createAppointmentPaymentIntent,
      } as unknown as CanonicalBookingDeps['payments'],
      canAcceptBookingPrepayment: async () => false,
    });

    const result = await createBookingOnCanonicalEngine(deps, createInput);

    expect(result.status).toBe('confirmed');
    expect(resolvePrepayment).not.toHaveBeenCalled();
    expect(createAppointmentPaymentIntent).not.toHaveBeenCalled();
    expect(deps.bookingsPort.markConfirmed).toHaveBeenCalledTimes(1);
  });
});
