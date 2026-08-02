import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  requireDoctorBookingEngine: vi.fn(),
  resolveDoctorCreateSpecialist: vi.fn(),
  buildAppDeps: vi.fn(),
  createBookingSyncPort: vi.fn(),
  createScheduledManualPatientVisit: vi.fn(),
  getSpecialistAppointmentReminderSettings: vi.fn(),
}));

vi.mock('../../_requireDoctorBookingEngine', () => ({
  requireDoctorBookingEngine: fakes.requireDoctorBookingEngine,
}));
vi.mock('../../_resolveDoctorAppointmentAccess', () => ({
  resolveDoctorCreateSpecialist: fakes.resolveDoctorCreateSpecialist,
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: fakes.buildAppDeps,
}));
vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withDoctorWorkspacePrincipal: (
    _workspace: unknown,
    _source: string,
    fn: () => Promise<unknown>,
  ) => fn(),
}));
vi.mock('@/app-layer/doctor/createScheduledManualPatientVisit', () => ({
  createScheduledManualPatientVisit: fakes.createScheduledManualPatientVisit,
  createWalkInManualPatientVisit: vi.fn(),
}));
vi.mock('@/modules/integrator/bookingM2mApi', () => ({
  createBookingSyncPort: fakes.createBookingSyncPort,
}));

import { POST } from './route';

/**
 * D13a(добор): врач заводит запланированный визит нового/существующего пациента
 * (manual-patient-visit, kind=scheduled) — до этой правки `booking.created` не нёс
 * reminderPlan, интегратор ставил напоминания по своим 24ч/2ч независимо от настроек.
 */
describe('doctor booking-engine manual-patient-visit (scheduled): reminderPlan в событии', () => {
  let captured: Array<Record<string, unknown>>;
  beforeEach(() => {
    vi.clearAllMocks();
    captured = [];
    fakes.getSpecialistAppointmentReminderSettings.mockResolvedValue({
      allowedPresetIds: ['day_before'],
      defaultPresetId: 'day_before',
    });

    fakes.requireDoctorBookingEngine.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: 'org-1',
        session: { user: { userId: 'user-doc-1' } },
        service: {
          getSpecialistAppointmentReminderSettings:
            fakes.getSpecialistAppointmentReminderSettings,
        },
      },
    });

    fakes.resolveDoctorCreateSpecialist.mockResolvedValue({
      ok: true,
      specialistId: '11111111-1111-4111-8111-111111111111',
    });

    fakes.buildAppDeps.mockReturnValue({
      bookingScheduling: null,
      patientBooking: { getBookingByCanonicalAppointment: async () => null },
      emailSetupAccess: {},
    });

    fakes.createScheduledManualPatientVisit.mockImplementation(async (input: {
      appointment: Record<string, unknown>;
    }) => ({
      ok: true,
      kind: 'scheduled',
      replayed: false,
      appointment: {
        id: 'appt-1',
        organizationId: 'org-1',
        startAt: '2027-03-10T09:00:00.000Z',
        endAt: '2027-03-10T09:30:00.000Z',
        appointmentReminderAllowedPresetIds:
          input.appointment.appointmentReminderAllowedPresetIds ?? [],
        appointmentReminderPresetId: input.appointment.appointmentReminderPresetId ?? null,
        attributionJson: {},
      },
      patient: {
        userId: 'user-patient-1',
        displayName: 'Иванов Иван',
        lastName: 'Иванов',
        firstName: 'Иван',
        patronymic: null,
        phoneNormalized: '+79990000000',
      },
      clinicalVisitId: 'visit-1',
      portalStatus: 'active',
    }));

    fakes.createBookingSyncPort.mockReturnValue({
      emitBookingEvent: vi.fn(async (evt: { payload: Record<string, unknown> }) => {
        captured.push(evt.payload);
      }),
    });
  });

  it('несёт план напоминаний из snapshot выбранного специалиста', async () => {
    const response = await POST(
      new Request('http://127.0.0.1/api/doctor/booking-engine/appointments/manual-patient-visit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'scheduled',
          requestId: '22222222-2222-4222-8222-222222222222',
          lastName: 'Иванов',
          firstName: 'Иван',
          phone: '+79990000000',
          startAt: '2027-03-10T09:00:00.000Z',
          endAt: '2027-03-10T09:30:00.000Z',
          durationMinutes: 30,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(captured[0]!.reminderPlan).toEqual({ enabled: true, offsetsMinutes: [1440] });
  });

  it('регрессия: если reminderPlan пропадёт из события, тест краснеет', async () => {
    await POST(
      new Request('http://127.0.0.1/api/doctor/booking-engine/appointments/manual-patient-visit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'scheduled',
          requestId: '22222222-2222-4222-8222-222222222222',
          lastName: 'Иванов',
          firstName: 'Иван',
          phone: '+79990000000',
          startAt: '2027-03-10T09:00:00.000Z',
          endAt: '2027-03-10T09:30:00.000Z',
          durationMinutes: 30,
        }),
      }),
    );

    expect(captured[0]).toHaveProperty('reminderPlan');
  });
});
