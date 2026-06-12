import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionMock = vi.hoisted(() => vi.fn());
const loadDoctorAnalyticsAudienceMock = vi.hoisted(() => vi.fn());
const getScheduleKpisMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/auth/service", () => ({ getCurrentSession: getSessionMock }));
vi.mock("@/app-layer/analytics/loadAnalyticsAudience", () => ({
  loadDoctorAnalyticsAudience: loadDoctorAnalyticsAudienceMock,
}));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: vi.fn(() => ({
    doctorAppointments: { getScheduleKpis: getScheduleKpisMock },
  })),
}));

import { GET } from "./route";

const sampleKpis = {
  recordsInPeriod: 10,
  pastInPeriod: 6,
  futureInPeriod: 4,
  bySubscriptionInPeriod: 2,
  firstVisitInPeriod: 3,
  repeatVisitInPeriod: 7,
  uniquePatientsInPeriod: 8,
  cancellationsInPeriod: 1,
  reschedulesInPeriod: 0,
};

const validUrl = "http://localhost/api/doctor/schedule-kpis?from=2026-06-01T00:00:00&to=2026-06-04T00:00:00";

describe("GET /api/doctor/schedule-kpis", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    loadDoctorAnalyticsAudienceMock.mockReset();
    getScheduleKpisMock.mockReset();
    loadDoctorAnalyticsAudienceMock.mockResolvedValue({ excludedUserIds: [] });
    getScheduleKpisMock.mockResolvedValue(sampleKpis);
  });

  it("returns 401 without session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await GET(new Request(validUrl));
    expect(res.status).toBe(401);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(false);
    expect(getScheduleKpisMock).not.toHaveBeenCalled();
  });

  it("returns 403 for client role", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "u1", role: "client", bindings: {} } });
    const res = await GET(new Request(validUrl));
    expect(res.status).toBe(403);
    expect(getScheduleKpisMock).not.toHaveBeenCalled();
  });

  it("returns 400 when from is missing", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "d1", role: "doctor", bindings: {} } });
    const res = await GET(new Request("http://localhost/api/doctor/schedule-kpis?to=2026-06-04T00:00:00"));
    expect(res.status).toBe(400);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(false);
  });

  it("returns 400 when to is missing", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "d1", role: "doctor", bindings: {} } });
    const res = await GET(new Request("http://localhost/api/doctor/schedule-kpis?from=2026-06-01T00:00:00"));
    expect(res.status).toBe(400);
  });

  it("returns 200 with kpis for doctor role", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "d1", role: "doctor", bindings: {} } });
    const res = await GET(new Request(validUrl));
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; kpis: typeof sampleKpis };
    expect(body.ok).toBe(true);
    expect(body.kpis).toEqual(sampleKpis);
  });

  it("returns 200 with kpis for admin role", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "a1", role: "admin", bindings: {} } });
    const res = await GET(new Request(validUrl));
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; kpis: typeof sampleKpis };
    expect(body.ok).toBe(true);
  });

  it("passes from/to/branchId/serviceId to getScheduleKpis", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "d1", role: "doctor", bindings: {} } });
    const url = "http://localhost/api/doctor/schedule-kpis?from=2026-06-01T00:00:00&to=2026-06-08T00:00:00&branchId=branch-1&serviceId=svc-2";
    await GET(new Request(url));
    expect(getScheduleKpisMock).toHaveBeenCalledWith(
      { from: "2026-06-01T00:00:00", to: "2026-06-08T00:00:00", branchId: "branch-1", serviceId: "svc-2" },
      { excludedUserIds: [] },
    );
  });

  it("passes audience.excludedUserIds to getScheduleKpis", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "d1", role: "doctor", bindings: {} } });
    loadDoctorAnalyticsAudienceMock.mockResolvedValue({ excludedUserIds: ["excluded-user"] });
    await GET(new Request(validUrl));
    const [, audience] = getScheduleKpisMock.mock.calls[0] as [unknown, { excludedUserIds: string[] }];
    expect(audience.excludedUserIds).toEqual(["excluded-user"]);
  });

  it("returns 500 on service error", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "d1", role: "doctor", bindings: {} } });
    getScheduleKpisMock.mockRejectedValue(new Error("db failure"));
    const res = await GET(new Request(validUrl));
    expect(res.status).toBe(500);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(false);
  });
});
