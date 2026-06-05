import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionMock = vi.hoisted(() => vi.fn());
const loadDoctorAnalyticsAudienceMock = vi.hoisted(() => vi.fn());
const listMetricAccountsMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/auth/service", () => ({ getCurrentSession: getSessionMock }));
vi.mock("@/app-layer/analytics/loadAnalyticsAudience", () => ({
  loadDoctorAnalyticsAudience: loadDoctorAnalyticsAudienceMock,
}));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    doctorAnalyticsMetricAccounts: {
      listMetricAccounts: listMetricAccountsMock,
    },
  }),
}));
vi.mock("@/modules/system-settings/appDisplayTimezone", () => ({
  getAppDisplayTimeZone: vi.fn(async () => "Europe/Moscow"),
}));

import { GET } from "./route";

describe("GET /api/doctor/analytics-metric-accounts", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    loadDoctorAnalyticsAudienceMock.mockReset();
    listMetricAccountsMock.mockReset();
    loadDoctorAnalyticsAudienceMock.mockResolvedValue({
      includeTestAccounts: false,
      excludedUserIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
    });
    listMetricAccountsMock.mockResolvedValue({
      items: [],
      hasMore: false,
      nextOffset: null,
    });
  });

  it("returns 401 without session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await GET(
      new Request("http://localhost/api/doctor/analytics-metric-accounts?metric=today_appointments_today"),
    );
    expect(res.status).toBe(401);
    expect(listMetricAccountsMock).not.toHaveBeenCalled();
  });

  it("rejects notification metrics on doctor route", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "d1", role: "doctor", bindings: {} } });
    const res = await GET(
      new Request("http://localhost/api/doctor/analytics-metric-accounts?metric=notif_push_opened"),
    );
    expect(res.status).toBe(400);
    expect(listMetricAccountsMock).not.toHaveBeenCalled();
  });

  it("passes excludedUserIds for today metric", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "d1", role: "doctor", bindings: {} } });
    const res = await GET(
      new Request("http://localhost/api/doctor/analytics-metric-accounts?metric=today_appointments_today&limit=20&offset=0"),
    );
    expect(res.status).toBe(200);
    expect(listMetricAccountsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        metric: "today_appointments_today",
        excludedUserIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
        windowHours: undefined,
      }),
    );
  });
});
