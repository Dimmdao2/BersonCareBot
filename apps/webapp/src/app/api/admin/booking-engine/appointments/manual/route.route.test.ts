import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  requireAdminBookingEngine: vi.fn(),
  buildAppDeps: vi.fn(),
  createBookingSyncPort: vi.fn(),
}));

vi.mock('../../_requireAdminBookingEngine', () => ({
  requireAdminBookingEngine: fakes.requireAdminBookingEngine,
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
 * D13a(добор): персонал создаёт запись через admin manual-create — до этой правки
 * событие `booking.created` собиралось вручную мимо getAppointmentReminderPlan и не
 * содержало reminderPlan, поэтому интегратор ставил напоминания по своим константам
 * 24ч/2ч даже когда клиника их выключила.
 */
describe('admin booking-engine manual-create: reminderPlan в событии', () => {
  let captured: Array<Record<string, unknown>>;
  let settingsRows: Record<string, unknown>;

  beforeEach(() => {
    vi.clearAllMocks();
    captured = [];
    settingsRows = {
      doctor_appointment_reminder_enabled: { valueJson: true },
      doctor_appointment_reminder_offsets_minutes: { valueJson: [30, 120] },
    };

    fakes.requireAdminBookingEngine.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: 'org-1',
        session: { user: { userId: 'user-admin-1' } },
        service: {
          createAppointment: vi.fn(async (input: Record<string, unknown>) => ({
            id: 'appt-1',
            organizationId: input.organizationId,
            startAt: input.startAt,
            endAt: input.endAt,
            platformUserId: input.platformUserId ?? null,
            phoneNormalized: input.phoneNormalized ?? null,
            attributionJson: {},
          })),
        },
      },
    });

    fakes.buildAppDeps.mockReturnValue({
      bookingScheduling: null,
      patientBooking: { getBookingByCanonicalAppointment: async () => null },
      systemSettings: {
        getSetting: vi.fn(async (key: string) => settingsRows[key] ?? null),
      },
    });

    fakes.createBookingSyncPort.mockReturnValue({
      emitBookingEvent: vi.fn(async (evt: { payload: Record<string, unknown> }) => {
        captured.push(evt.payload);
      }),
    });
  });

  it('несёт план напоминаний, построенный из настроек клиники', async () => {
    const response = await POST(
      new Request('http://127.0.0.1/api/admin/booking-engine/appointments/manual', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          specialistId: '11111111-1111-4111-8111-111111111111',
          startAt: '2027-03-10T09:00:00.000Z',
          endAt: '2027-03-10T09:30:00.000Z',
          durationMinutes: 30,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(captured[0]!.reminderPlan).toEqual({ enabled: true, offsetsMinutes: [30, 120] });
  });

  it('регрессия: если reminderPlan пропадёт из события, тест краснеет', async () => {
    await POST(
      new Request('http://127.0.0.1/api/admin/booking-engine/appointments/manual', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          specialistId: '11111111-1111-4111-8111-111111111111',
          startAt: '2027-03-10T09:00:00.000Z',
          endAt: '2027-03-10T09:30:00.000Z',
          durationMinutes: 30,
        }),
      }),
    );

    expect(captured[0]).toHaveProperty('reminderPlan');
  });
});
