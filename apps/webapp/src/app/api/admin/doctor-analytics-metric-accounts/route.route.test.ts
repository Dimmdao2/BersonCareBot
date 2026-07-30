import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  requireAdminModeSession: vi.fn(),
  requirePlatformOperationsApiContext: vi.fn(),
  loadDoctorAnalyticsAudience: vi.fn(),
  buildAppDeps: vi.fn(),
  listMetricAccounts: vi.fn(),
}));

vi.mock('@/modules/auth/requireAdminMode', () => ({
  requireAdminModeSession: fakes.requireAdminModeSession,
}));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requirePlatformOperationsApiContext: fakes.requirePlatformOperationsApiContext,
}));
vi.mock('@/app-layer/analytics/loadAnalyticsAudience', () => ({
  loadDoctorAnalyticsAudience: fakes.loadDoctorAnalyticsAudience,
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: fakes.buildAppDeps,
}));

import { GET } from './route';

beforeEach(() => {
  vi.clearAllMocks();
  fakes.requireAdminModeSession.mockResolvedValue({ ok: true, session: {} });
  fakes.requirePlatformOperationsApiContext.mockResolvedValue({ ok: true, session: {} });
  fakes.buildAppDeps.mockReturnValue({
    doctorAnalyticsMetricAccounts: {
      listMetricAccounts: fakes.listMetricAccounts,
    },
  });
});

describe('GET /api/admin/doctor-analytics-metric-accounts', () => {
  it('keeps patient-level drill-down fail-closed for an authorized platform admin', async () => {
    const response = await GET();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'platform_patient_drilldown_disabled',
    });
    expect(fakes.loadDoctorAnalyticsAudience).not.toHaveBeenCalled();
    expect(fakes.buildAppDeps).not.toHaveBeenCalled();
    expect(fakes.listMetricAccounts).not.toHaveBeenCalled();
  });
});
