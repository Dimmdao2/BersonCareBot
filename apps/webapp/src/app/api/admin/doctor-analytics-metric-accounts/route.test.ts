import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireAdminModeSessionMock,
  requirePlatformOperationsApiContextMock,
  getAppDisplayTimeZoneMock,
  loadDoctorAnalyticsAudienceMock,
  listMetricAccountsMock,
} = vi.hoisted(() => ({
  requireAdminModeSessionMock: vi.fn(),
  requirePlatformOperationsApiContextMock: vi.fn(),
  getAppDisplayTimeZoneMock: vi.fn(),
  loadDoctorAnalyticsAudienceMock: vi.fn(),
  listMetricAccountsMock: vi.fn(),
}));

vi.mock("@/modules/auth/requireAdminMode", () => ({
  requireAdminModeSession: requireAdminModeSessionMock,
}));

vi.mock("@/app-layer/guards/requireRole", () => ({
  requirePlatformOperationsApiContext: requirePlatformOperationsApiContextMock,
}));

vi.mock("@/modules/system-settings/appDisplayTimezone", () => ({
  getAppDisplayTimeZone: getAppDisplayTimeZoneMock,
}));

vi.mock("@/app-layer/analytics/loadAnalyticsAudience", () => ({
  loadDoctorAnalyticsAudience: loadDoctorAnalyticsAudienceMock,
}));

vi.mock("@/app-layer/stats/loadAdminReminderStats", () => ({
  parseReminderStatsWindowHours: () => 24,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    doctorAnalyticsMetricAccounts: {
      listMetricAccounts: listMetricAccountsMock,
    },
  }),
}));

import { GET } from "./route";

describe("GET /api/admin/doctor-analytics-metric-accounts", () => {
  beforeEach(() => {
    requireAdminModeSessionMock.mockReset().mockResolvedValue({
      ok: true,
      session: { user: { userId: "admin-1", role: "admin" }, adminMode: true },
    });
    requirePlatformOperationsApiContextMock.mockReset().mockResolvedValue({
      ok: true,
      session: {
        user: { userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", role: "admin" },
        adminMode: true,
      },
    });
    getAppDisplayTimeZoneMock.mockReset().mockResolvedValue("Europe/Moscow");
    loadDoctorAnalyticsAudienceMock.mockReset().mockResolvedValue({ excludedUserIds: [] });
    listMetricAccountsMock.mockReset().mockResolvedValue({ total: 0, items: [] });
  });

  it("returns metric accounts for the platform-admin audience", async () => {
    const res = await GET(
      new Request(
        "http://localhost/api/admin/doctor-analytics-metric-accounts?metric=clients_total&preset=week",
      ),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, total: 0, items: [] });
    expect(listMetricAccountsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        metric: "clients_total",
        iana: "Europe/Moscow",
        excludedUserIds: [],
      }),
    );
  });

  it("returns 403 before DB-backed analytics when the platform guard rejects a foreign audience", async () => {
    requirePlatformOperationsApiContextMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: "forbidden" }), { status: 403 }),
    });

    const res = await GET(
      new Request(
        "http://localhost/api/admin/doctor-analytics-metric-accounts?metric=clients_total&preset=week",
      ),
    );

    expect(res.status).toBe(403);
    expect(getAppDisplayTimeZoneMock).not.toHaveBeenCalled();
    expect(loadDoctorAnalyticsAudienceMock).not.toHaveBeenCalled();
    expect(listMetricAccountsMock).not.toHaveBeenCalled();
  });
});
