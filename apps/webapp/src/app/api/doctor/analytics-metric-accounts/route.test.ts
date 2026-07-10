import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionMock = vi.hoisted(() => vi.fn());
const loadDoctorAnalyticsAudienceMock = vi.hoisted(() => vi.fn());
const listMetricAccountsMock = vi.hoisted(() => vi.fn());
const listAppointmentsForSpecialistMock = vi.hoisted(() => vi.fn());
const resolveOrganizationForUserMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/auth/service", () => ({ getCurrentSession: getSessionMock }));
vi.mock("@/app-layer/analytics/loadAnalyticsAudience", () => ({
  loadDoctorAnalyticsAudience: loadDoctorAnalyticsAudienceMock,
}));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    doctorAppointments: {
      listAppointmentsForSpecialist: listAppointmentsForSpecialistMock,
    },
    doctorAnalyticsMetricAccounts: {
      listMetricAccounts: listMetricAccountsMock,
    },
    organizationMembership: {
      resolveOrganizationForUser: resolveOrganizationForUserMock,
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
    listAppointmentsForSpecialistMock.mockReset();
    resolveOrganizationForUserMock.mockReset();
    resolveOrganizationForUserMock.mockResolvedValue({
      ok: true,
      context: {
        organizationId: "10000000-0000-4000-8000-000000000001",
        role: "doctor",
      },
    });
    loadDoctorAnalyticsAudienceMock.mockResolvedValue({
      includeTestAccounts: false,
      excludedUserIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
    });
    listMetricAccountsMock.mockResolvedValue({
      items: [],
      hasMore: false,
      nextOffset: null,
    });
    listAppointmentsForSpecialistMock.mockResolvedValue([]);
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

  it("routes today appointment metric to doctorAppointments with audience", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "d1", role: "doctor", bindings: {} } });
    const res = await GET(
      new Request("http://localhost/api/doctor/analytics-metric-accounts?metric=today_appointments_today&limit=20&offset=0"),
    );
    expect(res.status).toBe(200);
    expect(listAppointmentsForSpecialistMock).toHaveBeenCalledWith(
      { kind: "range", range: "today" },
      {
        excludedUserIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
        organizationId: "10000000-0000-4000-8000-000000000001",
      },
    );
    expect(listMetricAccountsMock).not.toHaveBeenCalled();
  });

  it("routes cancellations 30d to doctorAppointments", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "d1", role: "doctor", bindings: {} } });
    const res = await GET(
      new Request("http://localhost/api/doctor/analytics-metric-accounts?metric=today_cancellations_30d"),
    );
    expect(res.status).toBe(200);
    expect(listAppointmentsForSpecialistMock).toHaveBeenCalledWith(
      { kind: "cancellations30d" },
      expect.objectContaining({
        excludedUserIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
        organizationId: "10000000-0000-4000-8000-000000000001",
      }),
    );
    expect(listMetricAccountsMock).not.toHaveBeenCalled();
  });
});
