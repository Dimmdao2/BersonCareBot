import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn(),
  requireDoctorBookingEngine: vi.fn(),
  withDoctorWorkspacePrincipal: vi.fn(),
  loadDoctorAnalyticsAudience: vi.fn(),
  getScheduleKpis: vi.fn(),
  listSpecialists: vi.fn(),
  resolveMechanicAccess: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/guards/doctorWorkspacePrincipal', () => ({
  withDoctorWorkspacePrincipal: fakes.withDoctorWorkspacePrincipal,
}));
vi.mock('@/app-layer/analytics/loadAnalyticsAudience', () => ({
  loadDoctorAnalyticsAudience: fakes.loadDoctorAnalyticsAudience,
}));
vi.mock('../booking-engine/_requireDoctorBookingEngine', () => ({
  requireDoctorBookingEngine: fakes.requireDoctorBookingEngine,
}));

import { GET } from './route';

const ORGANIZATION_ID = '20000000-0000-4000-8000-000000000001';
const OWN_ID = '10000000-0000-4000-8000-000000000001';

function request(): Request {
  return new Request(
    'https://app.example.test/api/doctor/schedule-kpis?from=2026-08-01T00:00:00.000Z&to=2026-08-08T00:00:00.000Z',
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fakes.requireDoctorBookingEngine.mockResolvedValue({
    ok: true,
    ctx: {
      organizationId: ORGANIZATION_ID,
      specialistId: OWN_ID,
      canManageAllSpecialists: false,
      service: { catalog: { listSpecialists: fakes.listSpecialists } },
    },
  });
  fakes.listSpecialists.mockResolvedValue([
    { id: OWN_ID, fullName: 'Свой специалист', isActive: true },
  ]);
  fakes.loadDoctorAnalyticsAudience.mockResolvedValue(null);
  fakes.withDoctorWorkspacePrincipal.mockImplementation(
    (_ctx: unknown, _source: string, callback: () => unknown) => callback(),
  );
  fakes.getScheduleKpis.mockResolvedValue({ total: 0 });
  fakes.buildAppDeps.mockReturnValue({
    doctorAppointments: { getScheduleKpis: fakes.getScheduleKpis },
    orgEntitlements: { resolveMechanicAccess: fakes.resolveMechanicAccess },
  });
});

describe('GET /api/doctor/schedule-kpis entitlement gate', () => {
  it('refuses KPIs before reading data when doctor_statistics is disabled', async () => {
    fakes.resolveMechanicAccess.mockResolvedValue({ state: 'disabled', warning: null });

    const response = await GET(request());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ ok: false, error: 'entitlement_required', mechanic: 'doctor_statistics' }),
    );
    expect(fakes.getScheduleKpis).not.toHaveBeenCalled();
    expect(fakes.resolveMechanicAccess).toHaveBeenCalledWith(ORGANIZATION_ID, 'doctor_statistics');
  });

  it('keeps KPIs readable when doctor_statistics is read_only', async () => {
    fakes.resolveMechanicAccess.mockResolvedValue({ state: 'read_only', warning: null });

    const response = await GET(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ ok: true, kpis: { total: 0 } }),
    );
    expect(fakes.getScheduleKpis).toHaveBeenCalledTimes(1);
  });

  it('keeps KPIs readable when doctor_statistics is full_access', async () => {
    fakes.resolveMechanicAccess.mockResolvedValue({ state: 'full_access', warning: null });

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(fakes.getScheduleKpis).toHaveBeenCalledTimes(1);
  });
});
