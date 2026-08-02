import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  requireDoctorBookingEngine: vi.fn(),
  resolveDoctorCreateSpecialist: vi.fn(),
  buildAppDeps: vi.fn(),
  createBookingSyncPort: vi.fn(),
  createAppointment: vi.fn(),
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
vi.mock('@/modules/integrator/bookingM2mApi', () => ({
  createBookingSyncPort: fakes.createBookingSyncPort,
}));

import { POST } from './route';

/**
 * D13a(добор): врач создаёт запись вручную (doctor manual-create) — до этой правки
 * `booking.created` не содержал reminderPlan, интегратор ставил напоминания по
 * зашитым 24ч/2ч независимо от настроек клиники.
 */
describe('doctor booking-engine manual-create: reminderPlan в событии', () => {
  let captured: Array<Record<string, unknown>>;
  let settingsRows: Record<string, unknown>;

  beforeEach(() => {
    vi.clearAllMocks();
    captured = [];
    settingsRows = {
      doctor_appointment_reminder_enabled: { valueJson: false },
      doctor_appointment_reminder_offsets_minutes: { valueJson: [] },
    };

    fakes.createAppointment.mockImplementation(async (input: Record<string, unknown>) => ({
      id: 'appt-1',
      organizationId: input.organizationId,
      specialistId: input.specialistId,
      startAt: input.startAt,
      endAt: input.endAt,
      platformUserId: input.platformUserId ?? null,
      phoneNormalized: input.phoneNormalized ?? null,
      appointmentReminderAllowedPresetIds: input.appointmentReminderAllowedPresetIds ?? [],
      appointmentReminderPresetId: input.appointmentReminderPresetId ?? null,
      attributionJson: {},
    }));
    fakes.getSpecialistAppointmentReminderSettings.mockResolvedValue({
      allowedPresetIds: ['day_before', 'two_hours_before'],
      defaultPresetId: 'day_before',
    });

    fakes.requireDoctorBookingEngine.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: 'org-1',
        session: { user: { userId: 'user-doc-1', role: 'specialist' } },
        service: {
          createAppointment: fakes.createAppointment,
          getAppointment: vi.fn(async () => null),
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
      patientOrganization: null,
      memberships: null,
      systemSettings: {
        getSetting: vi.fn(async (key: string) => settingsRows[key] ?? null),
      },
      bookingEngine: {
        getSpecialistAppointmentReminderSettings:
          fakes.getSpecialistAppointmentReminderSettings,
      },
    });

    fakes.createBookingSyncPort.mockReturnValue({
      emitBookingEvent: vi.fn(async (evt: { payload: Record<string, unknown> }) => {
        captured.push(evt.payload);
      }),
    });
  });

  it('несёт план напоминаний — выключенные напоминания клиники доходят до события', async () => {
    fakes.getSpecialistAppointmentReminderSettings.mockResolvedValue({
      allowedPresetIds: [],
      defaultPresetId: null,
    });
    const response = await POST(
      new Request('http://127.0.0.1/api/doctor/booking-engine/appointments/manual', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          startAt: '2027-03-10T09:00:00.000Z',
          endAt: '2027-03-10T09:30:00.000Z',
          durationMinutes: 30,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(captured[0]!.reminderPlan).toEqual({ enabled: false, offsetsMinutes: [] });
  });

  it('регрессия: если reminderPlan пропадёт из события, тест краснеет', async () => {
    await POST(
      new Request('http://127.0.0.1/api/doctor/booking-engine/appointments/manual', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          startAt: '2027-03-10T09:00:00.000Z',
          endAt: '2027-03-10T09:30:00.000Z',
          durationMinutes: 30,
        }),
      }),
    );

    expect(captured[0]).toHaveProperty('reminderPlan');
  });

  it('uses the selected specialist presets for a staff-created appointment', async () => {
    const response = await POST(
      new Request('http://127.0.0.1/api/doctor/booking-engine/appointments/manual', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          startAt: '2027-03-10T09:00:00.000Z',
          endAt: '2027-03-10T09:30:00.000Z',
          durationMinutes: 30,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(fakes.createAppointment).toHaveBeenCalledWith(
      expect.objectContaining({
        appointmentReminderAllowedPresetIds: ['day_before', 'two_hours_before'],
        appointmentReminderPresetId: 'day_before',
      }),
    );
    expect(captured[0]!.reminderPlan).toEqual({ enabled: true, offsetsMinutes: [1440] });
  });
});
