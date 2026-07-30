import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DoctorBookingEngineContext } from './_requireDoctorBookingEngine';

const mocks = vi.hoisted(() => ({
  buildAppDeps: vi.fn(),
  getCalendar: vi.fn(),
  getScheduleKpis: vi.fn(),
  listSpecialists: vi.fn(),
  nearestFreeWindow: vi.fn(),
  requireDoctorBookingEngine: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: mocks.buildAppDeps,
}));
vi.mock('@/app-layer/analytics/loadAnalyticsAudience', () => ({
  loadDoctorAnalyticsAudience: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/app-layer/booking/resolveDoctorCalendarIana', () => ({
  resolveDoctorCalendarIana: vi.fn().mockResolvedValue('Europe/Moscow'),
}));
vi.mock('@/modules/system-settings/appDisplayTimezone', () => ({
  DEFAULT_APP_DISPLAY_TIMEZONE: 'Europe/Moscow',
  getAppDisplayTimeZone: vi.fn().mockResolvedValue('Europe/Moscow'),
}));
vi.mock('@/app-layer/guards/doctorWorkspacePrincipal', () => ({
  withDoctorWorkspacePrincipal: vi.fn(
    <T>(_ctx: unknown, _source: string, callback: () => T): T => callback(),
  ),
}));
vi.mock('@/infra/logging/logger', () => ({
  logger: { error: vi.fn() },
  serializeError: (error: unknown) => error,
}));
vi.mock('@/app/api/doctor/booking-engine/_requireDoctorBookingEngine', () => ({
  requireDoctorBookingEngine: mocks.requireDoctorBookingEngine,
}));

import { GET as getCalendar } from './calendar/route';
import { GET as getScheduleKpis } from '../schedule-kpis/route';
import { GET as getNearestFreeWindow } from '../schedule/nearest-free-window/route';

const ORGANIZATION_ID = '20000000-0000-4000-8000-000000000001';
const OWN_ID = '10000000-0000-4000-8000-000000000001';
const OTHER_ID = '10000000-0000-4000-8000-000000000002';
const BRANCH_ID = '30000000-0000-4000-8000-000000000001';
const SERVICE_ID = '40000000-0000-4000-8000-000000000001';

function doctorContext(): DoctorBookingEngineContext {
  return {
    session: {
      user: { userId: 'doctor-user', role: 'doctor', bindings: {} },
      issuedAt: 1,
      expiresAt: 2,
    } as DoctorBookingEngineContext['session'],
    service: {
      catalog: { listSpecialists: mocks.listSpecialists },
    } as unknown as DoctorBookingEngineContext['service'],
    organizationId: ORGANIZATION_ID,
    membershipId: 'membership-1',
    membershipRole: 'doctor',
    specialistId: OWN_ID,
    canManageOrganization: false,
    canManageAllSpecialists: false,
  };
}

function clinicAdminContext(): DoctorBookingEngineContext {
  return {
    ...doctorContext(),
    membershipRole: 'admin',
    canManageOrganization: true,
    canManageAllSpecialists: true,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listSpecialists.mockResolvedValue([
    { id: OWN_ID, fullName: 'Свой специалист', isActive: true },
    { id: OTHER_ID, fullName: 'Другой специалист', isActive: true },
  ]);
  mocks.requireDoctorBookingEngine.mockResolvedValue({ ok: true, ctx: doctorContext() });
  mocks.getCalendar.mockResolvedValue({
    events: [],
    filters: {
      specialists: [
        { id: OWN_ID, label: 'Свой специалист' },
        { id: OTHER_ID, label: 'Другой специалист' },
      ],
      branches: [],
      rooms: [],
      services: [
        {
          id: SERVICE_ID,
          label: 'Приём',
          durationMinutes: 30,
          availability: [
            { specialistId: OWN_ID, branchId: BRANCH_ID },
            { specialistId: OTHER_ID, branchId: BRANCH_ID },
          ],
        },
      ],
    },
    readSource: 'canonical',
    showWorkingHours: true,
    workingBounds: null,
  });
  mocks.getScheduleKpis.mockResolvedValue({ total: 0 });
  mocks.nearestFreeWindow.mockResolvedValue(null);
  mocks.buildAppDeps.mockReturnValue({
    bookingCalendar: { getCalendar: mocks.getCalendar },
    doctorAppointments: { getScheduleKpis: mocks.getScheduleKpis },
    bookingScheduling: { nearestFreeWindow: mocks.nearestFreeWindow },
  });
});

describe('doctor schedule route scope', () => {
  it('forces a doctor-owned specialist through calendar, KPI, nearest-window, and filter metadata', async () => {
    const hostileScope = `scope=clinic&specialistId=${OTHER_ID}`;

    const calendarResponse = await getCalendar(
      new Request(
        `https://app.example.test/api/doctor/booking-engine/calendar?date=2026-07-30&${hostileScope}`,
      ),
    );
    const kpiResponse = await getScheduleKpis(
      new Request(
        `https://app.example.test/api/doctor/schedule-kpis?from=2026-07-01&to=2026-08-01&${hostileScope}`,
      ),
    );
    const nearestResponse = await getNearestFreeWindow(
      new Request(
        `https://app.example.test/api/doctor/schedule/nearest-free-window?${hostileScope}`,
      ),
    );

    expect(calendarResponse.status).toBe(200);
    expect(kpiResponse.status).toBe(200);
    expect(nearestResponse.status).toBe(200);

    expect(mocks.getCalendar).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORGANIZATION_ID, specialistId: OWN_ID }),
    );
    expect(mocks.getScheduleKpis).toHaveBeenCalledWith(
      expect.objectContaining({ specialistId: OWN_ID }),
      expect.objectContaining({ organizationId: ORGANIZATION_ID }),
    );
    expect(mocks.nearestFreeWindow).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORGANIZATION_ID, specialistId: OWN_ID }),
    );

    const calendarBody = (await calendarResponse.json()) as {
      filters: {
        specialists: { id: string }[];
        services: { availability: { specialistId: string }[] }[];
      };
      resolvedScope: { scope: string; specialistId: string };
    };
    expect(calendarBody.resolvedScope).toMatchObject({
      scope: 'mine',
      specialistId: OWN_ID,
    });
    expect(calendarBody.filters.specialists).toEqual([expect.objectContaining({ id: OWN_ID })]);
    expect(calendarBody.filters.services[0]?.availability).toEqual([
      expect.objectContaining({ specialistId: OWN_ID }),
    ]);
  });

  it('applies a clinic admin selected specialist consistently without losing clinic switch options', async () => {
    mocks.requireDoctorBookingEngine.mockResolvedValue({ ok: true, ctx: clinicAdminContext() });
    const selectedScope = `scope=specialist&specialistId=${OTHER_ID}`;

    const calendarResponse = await getCalendar(
      new Request(
        `https://app.example.test/api/doctor/booking-engine/calendar?date=2026-07-30&${selectedScope}`,
      ),
    );
    await getScheduleKpis(
      new Request(
        `https://app.example.test/api/doctor/schedule-kpis?from=2026-07-01&to=2026-08-01&${selectedScope}`,
      ),
    );
    await getNearestFreeWindow(
      new Request(
        `https://app.example.test/api/doctor/schedule/nearest-free-window?${selectedScope}`,
      ),
    );

    expect(mocks.getCalendar).toHaveBeenCalledWith(
      expect.objectContaining({ specialistId: OTHER_ID }),
    );
    expect(mocks.getScheduleKpis).toHaveBeenCalledWith(
      expect.objectContaining({ specialistId: OTHER_ID }),
      expect.anything(),
    );
    expect(mocks.nearestFreeWindow).toHaveBeenCalledWith(
      expect.objectContaining({ specialistId: OTHER_ID }),
    );

    const calendarBody = (await calendarResponse.json()) as {
      filters: {
        specialists: { id: string }[];
        services: { availability: { specialistId: string }[] }[];
      };
      resolvedScope: {
        scope: string;
        specialistId: string;
        specialists: { id: string }[];
      };
    };
    expect(calendarBody.filters.specialists).toEqual([expect.objectContaining({ id: OTHER_ID })]);
    expect(calendarBody.filters.services[0]?.availability).toEqual([
      expect.objectContaining({ specialistId: OTHER_ID }),
    ]);
    expect(calendarBody.resolvedScope).toMatchObject({
      scope: 'specialist',
      specialistId: OTHER_ID,
      specialists: [{ id: OWN_ID }, { id: OTHER_ID }],
    });
  });
});
