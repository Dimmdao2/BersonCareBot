import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  requireAdminModeSessionMock,
  requirePlatformOperationsApiContextMock,
  getAppDisplayTimeZoneMock,
  loadDoctorAnalyticsAudienceMock,
  getAppointmentStatsMock,
  getAppointmentDailySeriesMock,
} = vi.hoisted(() => ({
  requireAdminModeSessionMock: vi.fn(),
  requirePlatformOperationsApiContextMock: vi.fn(),
  getAppDisplayTimeZoneMock: vi.fn(),
  loadDoctorAnalyticsAudienceMock: vi.fn(),
  getAppointmentStatsMock: vi.fn(),
  getAppointmentDailySeriesMock: vi.fn(),
}));

vi.mock('@/modules/auth/requireAdminMode', () => ({
  requireAdminModeSession: requireAdminModeSessionMock,
}));

vi.mock('@/app-layer/guards/requireRole', () => ({
  requirePlatformOperationsApiContext: requirePlatformOperationsApiContextMock,
}));

vi.mock('@/modules/system-settings/appDisplayTimezone', () => ({
  getAppDisplayTimeZone: getAppDisplayTimeZoneMock,
}));

vi.mock('@/app-layer/analytics/loadAnalyticsAudience', () => ({
  loadDoctorAnalyticsAudience: loadDoctorAnalyticsAudienceMock,
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    doctorAppointments: {
      getAppointmentStats: getAppointmentStatsMock,
      getAppointmentDailySeries: getAppointmentDailySeriesMock,
    },
  }),
}));

import { GET } from './route';

describe('GET /api/admin/doctor-analytics-appointments', () => {
  beforeEach(() => {
    requireAdminModeSessionMock.mockReset().mockResolvedValue({
      ok: true,
      session: { user: { userId: 'admin-1', role: 'admin' }, adminMode: true },
    });
    requirePlatformOperationsApiContextMock.mockReset().mockResolvedValue({
      ok: true,
      session: {
        user: { userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'admin' },
        adminMode: true,
      },
    });
    getAppDisplayTimeZoneMock.mockReset().mockResolvedValue('Europe/Moscow');
    loadDoctorAnalyticsAudienceMock.mockReset().mockResolvedValue({ excludedUserIds: [] });
    getAppointmentStatsMock.mockReset().mockResolvedValue({ total: 0 });
    getAppointmentDailySeriesMock
      .mockReset()
      .mockResolvedValue({ daySeries: [], branchSeries: [] });
  });

  it('returns platform analytics for the platform-admin audience', async () => {
    const res = await GET(
      new Request('http://localhost/api/admin/doctor-analytics-appointments?preset=week'),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      appointments: { total: 0 },
      daySeries: [],
      branchSeries: [],
    });
    expect(getAppointmentStatsMock).toHaveBeenCalled();
    expect(getAppointmentDailySeriesMock).toHaveBeenCalled();
  });

  it('returns 403 before DB-backed analytics when the platform guard rejects a foreign audience', async () => {
    requirePlatformOperationsApiContextMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: 'forbidden' }), { status: 403 }),
    });

    const res = await GET(
      new Request('http://localhost/api/admin/doctor-analytics-appointments?preset=week'),
    );

    expect(res.status).toBe(403);
    expect(getAppDisplayTimeZoneMock).not.toHaveBeenCalled();
    expect(loadDoctorAnalyticsAudienceMock).not.toHaveBeenCalled();
    expect(getAppointmentStatsMock).not.toHaveBeenCalled();
  });
});
