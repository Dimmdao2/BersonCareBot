import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn(),
  requirePatientApiBusinessAccess: vi.fn(),
  getPatientAppointmentReminderPreference: vi.fn(),
  setPatientAppointmentReminderPreset: vi.fn(),
  getBookingByCanonicalAppointment: vi.fn(),
  emitBookingEvent: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requirePatientApiBusinessAccess: fakes.requirePatientApiBusinessAccess,
}));

import { PATCH } from './route';

const appointmentId = '11111111-1111-4111-8111-111111111111';
const bookingId = '22222222-2222-4222-8222-222222222222';

function patchReminder(presetId: string | null, mutationId: string) {
  return PATCH(
    new Request(`http://localhost/api/booking/appointments/${appointmentId}/reminders`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ presetId, mutationId }),
    }),
    { params: Promise.resolve({ appointmentId }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fakes.requirePatientApiBusinessAccess.mockResolvedValue({
    ok: true,
    session: { user: { userId: '33333333-3333-4333-8333-333333333333' } },
  });
  fakes.getPatientAppointmentReminderPreference.mockResolvedValue({
    organizationId: '44444444-4444-4444-8444-444444444444',
    status: 'confirmed',
    allowedPresetIds: ['day_before', 'two_hours_before'],
    presetId: 'day_before',
    selectionSource: 'patient',
  });
  fakes.setPatientAppointmentReminderPreset.mockResolvedValue(true);
  fakes.getBookingByCanonicalAppointment.mockResolvedValue({
    id: bookingId,
    bookingType: 'online',
    city: null,
    category: 'general',
    slotStart: '2027-03-10T09:00:00.000Z',
    slotEnd: '2027-03-10T09:30:00.000Z',
    contactName: 'Пациент',
    contactPhone: '+79990000000',
    contactEmail: null,
  });
  fakes.emitBookingEvent.mockResolvedValue(undefined);
  fakes.buildAppDeps.mockReturnValue({
    bookingEngine: {
      getPatientAppointmentReminderPreference: fakes.getPatientAppointmentReminderPreference,
      setPatientAppointmentReminderPreset: fakes.setPatientAppointmentReminderPreset,
    },
    patientBooking: {
      getBookingByCanonicalAppointment: fakes.getBookingByCanonicalAppointment,
    },
    bookingSync: { emitBookingEvent: fakes.emitBookingEvent },
  });
});

describe('patient appointment reminder preference', () => {
  it('does not deduplicate a later return to an earlier choice', async () => {
    expect(
      (await patchReminder('day_before', '55555555-5555-4555-8555-555555555551')).status,
    ).toBe(200);
    expect(
      (await patchReminder('two_hours_before', '55555555-5555-4555-8555-555555555552'))
        .status,
    ).toBe(200);
    expect(
      (await patchReminder('day_before', '55555555-5555-4555-8555-555555555553')).status,
    ).toBe(200);

    const emitted = fakes.emitBookingEvent.mock.calls.map(
      ([event]) => (event as { idempotencyKey: string }).idempotencyKey,
    );
    expect(new Set(emitted).size).toBe(3);
  });

  it('does not schedule when the atomic write loses confirmed status or the allowed preset', async () => {
    fakes.setPatientAppointmentReminderPreset.mockResolvedValue(false);

    const response = await patchReminder(
      'day_before',
      '66666666-6666-4666-8666-666666666666',
    );

    expect(response.status).toBe(404);
    expect(fakes.emitBookingEvent).not.toHaveBeenCalled();
  });
});
