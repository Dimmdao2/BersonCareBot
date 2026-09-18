import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppointmentPatientLifecycleFact } from '@/modules/booking-appointment-lifecycle/ports';
import { prepareAppointmentReminderDeliveries } from '@/modules/booking-notifications/appointmentReminderMaterialization';

// Oracle: S11 audit brief — revoked reminders cannot reach patients, and a signed replay
// cannot borrow another tenant/patient/appointment's money. These are HTTP-boundary tests,
// not a claim about the database's RLS or the signing algorithm (both are external here).
const fakes = vi.hoisted(() => ({
  emit: vi.fn(async (_input: unknown) => undefined),
  appointment: vi.fn(),
  history: vi.fn(),
  money: vi.fn(),
}));
vi.mock('@/app-layer/integrator/verifyIntegratorSignature', () => ({ verifyIntegratorSignature: () => true }));
vi.mock('@/app-layer/principal/integratorOrganizationPrincipal', () => ({
  enterVerifiedIntegratorOrganizationPrincipal: () => true,
}));
vi.mock('@/modules/integrator/bookingM2mApi', () => ({ createBookingSyncPort: () => ({ emitBookingEvent: fakes.emit }) }));
vi.mock('@/modules/system-settings/appDisplayTimezone', () => ({ getAppDisplayTimeZone: async () => 'UTC' }));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    bookingEngine: { getAppointment: fakes.appointment, getAppointmentLifecycleHistory: fakes.history },
    bookingAppointmentLifecycle: { readPatientLifecycleFact: fakes.money },
    patientBooking: { getBookingByCanonicalAppointment: async () => null },
    systemSettings: { getSetting: async () => null },
  }),
}));
import { POST } from './route';

const org = '10000000-0000-4000-8000-000000000001';
const appointmentId = '20000000-0000-4000-8000-000000000002';
const patient = '30000000-0000-4000-8000-000000000003';
const factId = '40000000-0000-4000-8000-000000000004';
const other = '50000000-0000-4000-8000-000000000005';
const start = '2027-01-02T12:00:00.000Z';
const appointment = {
  id: appointmentId, organizationId: org, platformUserId: patient, status: 'confirmed',
  startAt: start, endAt: '2027-01-02T12:30:00.000Z', deliveryFormat: 'online',
  attributionJson: {}, appointmentReminderOffsetsMinutes: [120],
};

function request(fact: string, identity: string, fields: Record<string, string> = {}) {
  return new Request('https://webapp.test/api/integrator/appointments/lifecycle', {
    method: 'POST',
    headers: {
      'x-bersoncare-timestamp': '1798898400', 'x-bersoncare-signature': 'verified-by-boundary',
      'x-bersoncare-idempotency-key': `booking.lifecycle:${fact}:${identity}`,
    },
    body: JSON.stringify({ organizationId: org, appointmentId, fact, ...fields }),
  });
}

function reminderRequest() {
  // Use the real producer to make the leased job; do not duplicate its identity encoding.
  const due = prepareAppointmentReminderDeliveries({
    organizationId: org, appointmentId, platformUserId: patient, bookingId: appointmentId,
    slotStartIso: start, generationRevision: 'before-cancellation', patientName: null,
    reminderPlan: { enabled: true, offsetsMinutes: [120] }, cancelPending: false,
  }, { selectedChannels: [], hasWebPush: false }, '2027-01-01T00:00:00.000Z', 'UTC')
    .find((row) => row.kind === 'booking_lifecycle');
  if (!due || due.kind !== 'booking_lifecycle') throw new Error('reminder occurrence missing');
  return request('reminder_due', due.reminderId, {
    reminderId: due.reminderId, generationStartAt: due.generationStartAt, dueAt: due.dueAt,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2027-01-02T10:00:00.000Z'));
  fakes.appointment.mockResolvedValue(appointment);
  fakes.history.mockResolvedValue(null);
  fakes.money.mockResolvedValue(null);
});
afterEach(() => vi.useRealTimers());

describe('S11 signed money / reminder replay acceptance', () => {
  it.each(['cancelled_by_patient', 'cancelled_by_specialist', 'no_show', 'late_cancellation'])(
    'K2: a leased reminder cannot reach the patient after %s', async (status) => {
      const leased = reminderRequest();
      fakes.appointment.mockResolvedValue({ ...appointment, status });
      await POST(leased);
      expect(fakes.emit).not.toHaveBeenCalled();
    },
  );

  it('K2: removing a due offset after lease revokes that reminder even when the slot stays the same', async () => {
    const leased = reminderRequest();
    fakes.appointment.mockResolvedValue({ ...appointment, appointmentReminderOffsetsMinutes: [60] });
    await POST(leased);
    expect(fakes.emit).not.toHaveBeenCalled();
  });

  it.each(['cash_payment', 'cash_refund', 'refund_succeeded', 'prepayment_retained'] as const)(
    'K9: %s refuses another tenant, appointment, patient or unsuccessful/missing fact', async (kind) => {
      const fact: AppointmentPatientLifecycleFact = {
        id: factId, organizationId: org, appointmentId, platformUserId: patient, kind,
        amountMinor: 3000, currency: 'RUB', occurredAt: '2027-01-02T09:59:00.000Z',
      };
      const fields: Record<string, string> = kind === 'cash_payment' || kind === 'cash_refund'
        ? { ledgerId: factId } : { paymentHistoryId: factId };
      for (const denied of [null, { ...fact, organizationId: other },
        { ...fact, appointmentId: other }, { ...fact, platformUserId: other }, { ...fact, id: other }]) {
        fakes.money.mockResolvedValue(denied);
        expect((await POST(request(kind, factId, fields))).status).toBe(409);
        expect(fakes.emit).not.toHaveBeenCalled();
      }
      fakes.money.mockResolvedValue(fact);
      expect((await POST(request(kind, factId, fields))).status).toBe(200);
      expect(fakes.emit).toHaveBeenCalledOnce();
    },
  );

  it.each(['completed', 'visit_confirmed'])('K6: accepts existing %s history but rejects unrelated transitions', async (toStatus) => {
    const history = { id: factId, organizationId: org, appointmentId,
      eventType: 'status_changed', payload: { toStatus: 'confirmed' } };
    fakes.history.mockResolvedValue(history);
    expect((await POST(request('visit_completed', factId, { historyId: factId }))).status).toBe(409);
    expect(fakes.emit).not.toHaveBeenCalled();
    fakes.history.mockResolvedValue({ ...history, payload: { toStatus } });
    expect((await POST(request('visit_completed', factId, { historyId: factId }))).status).toBe(200);
    expect(fakes.emit).toHaveBeenCalledOnce();
  });
});
