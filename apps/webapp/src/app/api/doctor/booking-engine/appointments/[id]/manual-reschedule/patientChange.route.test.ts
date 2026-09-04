import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Owner acceptance 2026-09-04, `APPT-FORM-12/13`: режим «Изменить» переиспользует общую форму, и
 * пациент в ней редактируется. Смена идёт через действующий lifecycle-контракт переноса, второго
 * endpoint нет.
 *
 * Поломки, которые ловит файл:
 * - выбранный в форме пациент не доходит до lifecycle — правка молча сохраняет прежнего;
 * - маршрут отправляет смену пациента там, где пациент не менялся;
 * - запись из самозаписи пациента меняет пациента, хотя уведомление уйдёт по контактам прежнего
 *   из проекции;
 * - отказ доменного слоя (`patient_change_not_allowed`) вырождается в общий 500 без причины.
 */
const fakes = vi.hoisted(() => ({
  requireDoctorBookingEngine: vi.fn(),
  resolveDoctorAppointmentAccess: vi.fn(),
  staffReschedule: vi.fn(),
  getBookingByCanonicalAppointment: vi.fn(),
  applyStaffRescheduleSideEffects: vi.fn(),
}));

vi.mock('../../../_requireDoctorBookingEngine', () => ({
  requireDoctorBookingEngine: fakes.requireDoctorBookingEngine,
}));
vi.mock('../../../_resolveDoctorAppointmentAccess', () => ({
  resolveDoctorAppointmentAccess: fakes.resolveDoctorAppointmentAccess,
}));
vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withDoctorWorkspacePrincipal: (_ctx: unknown, _source: string, work: () => Promise<unknown>) =>
    work(),
}));
vi.mock('@/app-layer/booking/staffAppointmentLifecycleEffects', () => ({
  applyStaffRescheduleSideEffects: fakes.applyStaffRescheduleSideEffects,
}));
vi.mock('@/modules/integrator/bookingM2mApi', () => ({
  createBookingSyncPort: () => ({ emitBookingEvent: vi.fn(async () => undefined) }),
}));
vi.mock('@/modules/booking-notifications/settings', () => ({
  loadBookingLifecycleNotificationsFromSystemSettings: async () => null,
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    bookingAppointmentLifecycle: { staffReschedule: fakes.staffReschedule },
    patientBooking: {
      getBookingByCanonicalAppointment: fakes.getBookingByCanonicalAppointment,
    },
    systemSettings: { getSetting: async () => null },
    payments: null,
  }),
}));

import { POST } from './route';

const ORGANIZATION_ID = '22222222-2222-4222-8222-222222222222';
const APPOINTMENT_ID = '11111111-1111-4111-8111-111111111111';
const SPECIALIST_ID = '33333333-3333-4333-8333-333333333333';
const CURRENT_PATIENT_ID = '44444444-4444-4444-8444-444444444444';
const NEXT_PATIENT_ID = '55555555-5555-4555-8555-555555555555';

function request(body: Record<string, unknown>) {
  return new Request(
    `http://test/api/doctor/booking-engine/appointments/${APPOINTMENT_ID}/manual-reschedule`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        newStartAt: '2027-03-10T09:00:00.000Z',
        newEndAt: '2027-03-10T09:45:00.000Z',
        durationMinutes: 45,
        ...body,
      }),
    },
  );
}

const context = { params: Promise.resolve({ id: APPOINTMENT_ID }) };

beforeEach(() => {
  vi.clearAllMocks();
  fakes.requireDoctorBookingEngine.mockResolvedValue({
    ok: true,
    ctx: {
      organizationId: ORGANIZATION_ID,
      session: { user: { userId: 'user-1', role: 'specialist' } },
    },
  });
  fakes.resolveDoctorAppointmentAccess.mockResolvedValue({
    id: APPOINTMENT_ID,
    organizationId: ORGANIZATION_ID,
    specialistId: SPECIALIST_ID,
    platformUserId: CURRENT_PATIENT_ID,
  });
  fakes.getBookingByCanonicalAppointment.mockResolvedValue(null);
  fakes.staffReschedule.mockImplementation(async () => ({
    ok: true as const,
    appointment: {
      id: APPOINTMENT_ID,
      organizationId: ORGANIZATION_ID,
      platformUserId: NEXT_PATIENT_ID,
      appointmentReminderPresetId: null,
    },
    reschedulePolicy: { id: 'default' },
  }));
});

describe('manual-reschedule: смена пациента (APPT-FORM-13)', () => {
  it('передаёт выбранного пациента в lifecycle того же переноса', async () => {
    const response = await POST(request({ platformUserId: NEXT_PATIENT_ID }), context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true });
    expect(fakes.staffReschedule).toHaveBeenCalledWith(
      expect.objectContaining({
        appointmentId: APPOINTMENT_ID,
        organizationId: ORGANIZATION_ID,
        platformUserId: NEXT_PATIENT_ID,
      }),
    );
  });

  it('не объявляет сменой пациента повтор текущего значения', async () => {
    const response = await POST(request({ platformUserId: CURRENT_PATIENT_ID }), context);

    expect(response.status).toBe(200);
    expect(fakes.staffReschedule).toHaveBeenCalledTimes(1);
    expect(fakes.staffReschedule.mock.calls[0]![0]).not.toHaveProperty('platformUserId');
  });

  it('отказывает в смене пациента у записи с проекцией самозаписи, не выполняя перенос', async () => {
    fakes.getBookingByCanonicalAppointment.mockResolvedValue({
      id: 'booking-1',
      userId: CURRENT_PATIENT_ID,
      contactPhone: '+79990000000',
    });

    const response = await POST(request({ platformUserId: NEXT_PATIENT_ID }), context);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'patient_change_not_allowed',
    });
    expect(fakes.staffReschedule).not.toHaveBeenCalled();
  });

  it('называет причину отказа доменного слоя вместо общего сбоя переноса', async () => {
    fakes.staffReschedule.mockRejectedValue(new Error('patient_change_not_allowed'));

    const response = await POST(request({ platformUserId: NEXT_PATIENT_ID }), context);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'patient_change_not_allowed',
    });
  });
});
