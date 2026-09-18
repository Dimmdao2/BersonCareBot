import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  emitBookingEvent: vi.fn(async (_input: unknown) => undefined),
  getAppointment: vi.fn(),
  getAppointmentLifecycleHistory: vi.fn(),
  getBranch: vi.fn(),
  getBookingByCanonicalAppointment: vi.fn(),
  listAppointmentCheckoutUrls: vi.fn(),
}));

vi.mock('@/app-layer/integrator/verifyIntegratorSignature', () => ({
  verifyIntegratorSignature: () => true,
}));
vi.mock('@/app-layer/principal/integratorOrganizationPrincipal', () => ({
  enterVerifiedIntegratorOrganizationPrincipal: () => true,
}));
vi.mock('@/modules/integrator/bookingM2mApi', () => ({
  createBookingSyncPort: () => ({ emitBookingEvent: fakes.emitBookingEvent }),
}));
vi.mock('@/modules/system-settings/appDisplayTimezone', () => ({
  getAppDisplayTimeZone: async () => 'UTC',
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    bookingEngine: {
      getAppointment: fakes.getAppointment,
      getAppointmentLifecycleHistory: fakes.getAppointmentLifecycleHistory,
      catalog: { getBranch: fakes.getBranch },
    },
    patientBooking: {
      getBookingByCanonicalAppointment: fakes.getBookingByCanonicalAppointment,
    },
    payments: { listAppointmentCheckoutUrls: fakes.listAppointmentCheckoutUrls },
    systemSettings: { getSetting: async () => null },
  }),
}));

import { POST } from './route';

const ORGANIZATION_ID = '10000000-0000-4000-8000-000000000001';
const APPOINTMENT_ID = '20000000-0000-4000-8000-000000000002';
const HISTORY_ID = '30000000-0000-4000-8000-000000000003';
const USER_ID = '40000000-0000-4000-8000-000000000004';
const BOOKING_ID = '50000000-0000-4000-8000-000000000005';
const BRANCH_ID = '60000000-0000-4000-8000-000000000006';

function request(input: {
  fact: 'created' | 'awaiting_payment' | 'rescheduled' | 'cancelled' | 'no_show';
  historyId?: string;
  key?: string;
}) {
  const body = {
    organizationId: ORGANIZATION_ID,
    appointmentId: APPOINTMENT_ID,
    ...(input.historyId ? { historyId: input.historyId } : {}),
    fact: input.fact,
  };
  const identity = input.historyId ?? APPOINTMENT_ID;
  return new Request('https://webapp.test/api/integrator/appointments/lifecycle', {
    method: 'POST',
    headers: {
      'x-bersoncare-timestamp': '1789776000',
      'x-bersoncare-signature': 'sig',
      'x-bersoncare-idempotency-key':
        input.key ?? `booking.lifecycle:${input.fact}:${identity}`,
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fakes.getAppointment.mockResolvedValue({
    id: APPOINTMENT_ID,
    organizationId: ORGANIZATION_ID,
    branchId: BRANCH_ID,
    platformUserId: USER_ID,
    startAt: '2027-01-02T12:00:00.000Z',
    endAt: '2027-01-02T12:30:00.000Z',
    deliveryFormat: 'in_person',
    phoneNormalized: '+79990000000',
    attributionJson: {},
    paymentDeadlineAt: '2027-01-02T11:30:00.000Z',
    appointmentReminderOffsetsMinutes: [],
  });
  fakes.getAppointmentLifecycleHistory.mockResolvedValue(null);
  fakes.getBranch.mockResolvedValue({
    id: BRANCH_ID,
    organizationId: ORGANIZATION_ID,
    timezone: 'Asia/Yekaterinburg',
  });
  fakes.listAppointmentCheckoutUrls.mockResolvedValue([
    { appointmentId: APPOINTMENT_ID, checkoutUrl: 'https://clinic.test/book/pay/intent-1' },
  ]);
  fakes.getBookingByCanonicalAppointment.mockResolvedValue({
    id: BOOKING_ID,
    userId: USER_ID,
    organizationId: ORGANIZATION_ID,
    canonicalAppointmentId: APPOINTMENT_ID,
    bookingType: 'in_person',
    city: null,
    category: 'general',
    slotStart: '2027-01-02T12:00:00.000Z',
    slotEnd: '2027-01-02T12:30:00.000Z',
    contactName: 'Пациент',
    contactPhone: '+79990000000',
    contactEmail: null,
    cityCodeSnapshot: null,
    serviceTitleSnapshot: 'Приём',
  });
});

describe('signed durable booking lifecycle replay', () => {
  it('fails closed when a history identity is not proven to belong to the appointment and fact', async () => {
    const response = await POST(request({ fact: 'rescheduled', historyId: HISTORY_ID }));

    expect(response.status).toBe(409);
    expect(fakes.emitBookingEvent).not.toHaveBeenCalled();
  });

  it('fails closed when the patient projection belongs to another platform user', async () => {
    fakes.getBookingByCanonicalAppointment.mockResolvedValue({
      id: BOOKING_ID,
      userId: '60000000-0000-4000-8000-000000000006',
      organizationId: ORGANIZATION_ID,
      canonicalAppointmentId: APPOINTMENT_ID,
      bookingType: 'in_person',
      city: null,
      category: 'general',
      slotStart: '2027-01-02T12:00:00.000Z',
      slotEnd: '2027-01-02T12:30:00.000Z',
      contactName: 'Другой пациент',
      contactPhone: '+79990000001',
      contactEmail: null,
      cityCodeSnapshot: null,
      serviceTitleSnapshot: 'Приём',
    });

    const response = await POST(request({ fact: 'created' }));

    expect(response.status).toBe(409);
    expect(fakes.emitBookingEvent).not.toHaveBeenCalled();
  });

  it('keeps awaiting-payment observable as its own lifecycle fact instead of confirming the booking', async () => {
    const response = await POST(request({ fact: 'awaiting_payment' }));

    expect(response.status).toBe(200);
    expect(fakes.emitBookingEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'booking.awaiting_payment',
        idempotencyKey: `booking.lifecycle:awaiting_payment:${APPOINTMENT_ID}`,
      }),
    );
  });

  it('formats an in-person payment deadline in the appointment branch timezone', async () => {
    const response = await POST(request({ fact: 'awaiting_payment' }));

    expect(response.status).toBe(200);
    const emitted = fakes.emitBookingEvent.mock.calls[0]?.[0] as
      | { payload?: { patientMessageText?: string } }
      | undefined;
    const branchDeadline = new Intl.DateTimeFormat('ru-RU', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Yekaterinburg',
    }).format(new Date('2027-01-02T11:30:00.000Z'));
    expect(emitted?.payload?.patientMessageText).toContain(branchDeadline);
    expect(emitted?.payload?.patientMessageText).toContain(
      'https://clinic.test/book/pay/intent-1',
    );
  });
});
