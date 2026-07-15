import { beforeEach, describe, expect, it, vi } from "vitest";

const requireDoctorWorkspaceApiContextMock = vi.hoisted(() => vi.fn());
const withDoctorWorkspacePrincipalMock = vi.hoisted(() =>
  vi.fn(async (_ctx: unknown, _source: string, fn: () => Promise<unknown>) => fn()),
);
const loadDoctorAnalyticsAudienceMock = vi.hoisted(() => vi.fn());
const getScheduleKpisMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorWorkspaceApiContext: requireDoctorWorkspaceApiContextMock,
}));
vi.mock("@/app-layer/guards/doctorWorkspacePrincipal", () => ({
  withDoctorWorkspacePrincipal: withDoctorWorkspacePrincipalMock,
}));
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
  firstVisitIds: ["appt-1", "appt-2", "appt-3"],
  repeatVisitInPeriod: 7,
  uniquePatientsInPeriod: 8,
  cancellationsInPeriod: 1,
  reschedulesInPeriod: 0,
};

const validUrl = "http://localhost/api/doctor/schedule-kpis?from=2026-06-01T00:00:00&to=2026-06-04T00:00:00";
const ORGANIZATION_A = "00000000-0000-4000-8000-0000000000aa";
const ORGANIZATION_B = "00000000-0000-4000-8000-0000000000bb";

function workspaceGate(
  organizationId = ORGANIZATION_A,
  role: "doctor" | "admin" = "doctor",
) {
  return {
    ok: true as const,
    ctx: {
      session: { user: { userId: "doctor-1", role, bindings: {} } },
      organizationId,
      membershipId: "membership-1",
      membershipRole: "doctor",
      specialistId: "specialist-1",
      canManageOrganization: false,
      canManageAllSpecialists: false,
    },
  };
}

describe("GET /api/doctor/schedule-kpis", () => {
  beforeEach(() => {
    requireDoctorWorkspaceApiContextMock.mockReset();
    withDoctorWorkspacePrincipalMock.mockClear();
    loadDoctorAnalyticsAudienceMock.mockReset();
    getScheduleKpisMock.mockReset();
    requireDoctorWorkspaceApiContextMock.mockResolvedValue(workspaceGate());
    loadDoctorAnalyticsAudienceMock.mockResolvedValue({ excludedUserIds: [] });
    getScheduleKpisMock.mockResolvedValue(sampleKpis);
  });

  it("returns 401 without session", async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: "unauthorized" }), { status: 401 }),
    });
    const res = await GET(new Request(validUrl));
    expect(res.status).toBe(401);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(false);
    expect(getScheduleKpisMock).not.toHaveBeenCalled();
  });

  it("returns 403 without an active clinic membership and does not call the repo", async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: false,
      response: new Response(
        JSON.stringify({ ok: false, error: "doctor_workspace_membership_required" }),
        { status: 403 },
      ),
    });
    const res = await GET(new Request(validUrl));
    expect(res.status).toBe(403);
    expect(getScheduleKpisMock).not.toHaveBeenCalled();
    expect(withDoctorWorkspacePrincipalMock).not.toHaveBeenCalled();
  });

  it("returns 400 when from is missing", async () => {
    const res = await GET(new Request("http://localhost/api/doctor/schedule-kpis?to=2026-06-04T00:00:00"));
    expect(res.status).toBe(400);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(false);
  });

  it("returns 400 when to is missing", async () => {
    const res = await GET(new Request("http://localhost/api/doctor/schedule-kpis?from=2026-06-01T00:00:00"));
    expect(res.status).toBe(400);
  });

  it("returns 200 with kpis for doctor role", async () => {
    const res = await GET(new Request(validUrl));
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; kpis: typeof sampleKpis };
    expect(body.ok).toBe(true);
    expect(body.kpis).toEqual(sampleKpis);
  });

  it("returns 200 with kpis for admin role", async () => {
    const gate = workspaceGate(ORGANIZATION_A, "admin");
    requireDoctorWorkspaceApiContextMock.mockResolvedValue(gate);
    const res = await GET(new Request(validUrl));
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; kpis: typeof sampleKpis };
    expect(body.ok).toBe(true);
  });

  it("passes from/to/branchId/serviceId to getScheduleKpis", async () => {
    const url = "http://localhost/api/doctor/schedule-kpis?from=2026-06-01T00:00:00&to=2026-06-08T00:00:00&branchId=branch-1&serviceId=svc-2";
    await GET(new Request(url));
    expect(getScheduleKpisMock).toHaveBeenCalledWith(
      { from: "2026-06-01T00:00:00", to: "2026-06-08T00:00:00", branchId: "branch-1", serviceId: "svc-2" },
      { excludedUserIds: [], organizationId: ORGANIZATION_A },
    );
  });

  it("passes audience.excludedUserIds to getScheduleKpis", async () => {
    loadDoctorAnalyticsAudienceMock.mockResolvedValue({ excludedUserIds: ["excluded-user"] });
    await GET(new Request(validUrl));
    const [, audience] = getScheduleKpisMock.mock.calls[0] as [
      unknown,
      { excludedUserIds: string[]; organizationId: string },
    ];
    expect(audience.excludedUserIds).toEqual(["excluded-user"]);
  });

  it.each([ORGANIZATION_A, ORGANIZATION_B])(
    "uses exactly the selected clinic organization %s",
    async (organizationId) => {
      const gate = workspaceGate(organizationId);
      requireDoctorWorkspaceApiContextMock.mockResolvedValue(gate);

      await GET(new Request(validUrl));

      expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
        gate.ctx,
        "doctor.schedule-kpis.read",
        expect.any(Function),
      );
      expect(getScheduleKpisMock).toHaveBeenCalledWith(
        expect.any(Object),
        { excludedUserIds: [], organizationId },
      );
    },
  );

  it("returns 500 on service error", async () => {
    getScheduleKpisMock.mockRejectedValue(new Error("db failure"));
    const res = await GET(new Request(validUrl));
    expect(res.status).toBe(500);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(false);
  });
});
