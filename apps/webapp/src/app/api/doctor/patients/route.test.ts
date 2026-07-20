import { beforeEach, describe, expect, it, vi } from "vitest";

const requireDoctorWorkspaceApiContextMock = vi.hoisted(() => vi.fn());
const listClientsMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorWorkspaceApiContext: () => requireDoctorWorkspaceApiContextMock(),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    doctorClients: {
      listClients: listClientsMock,
    },
  }),
}));

const doctorUserId = "10000000-0000-4000-8000-000000000001";
const organizationId = "20000000-0000-4000-8000-000000000002";

const workspaceCtx = {
  session: { user: { userId: doctorUserId, role: "doctor", bindings: {} } },
  organizationId,
  membershipId: "30000000-0000-4000-8000-000000000003",
  membershipRole: "doctor",
  specialistId: null,
  canManageOrganization: false,
  canManageAllSpecialists: false,
};

describe("GET /api/doctor/patients", () => {
  beforeEach(() => {
    requireDoctorWorkspaceApiContextMock.mockReset();
    listClientsMock.mockReset();
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({ ok: true, ctx: workspaceCtx });
    listClientsMock.mockResolvedValue([]);
  });

  it("lists patients inside the selected workspace organization", async () => {
    const { GET } = await import("./route");
    const res = await GET(
      new Request("http://localhost/api/doctor/patients?q=test&segment=on_support&channel=email"),
    );

    expect(res.status).toBe(200);
    expect(listClientsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        search: "test",
        organizationId,
        viewerUserId: doctorUserId,
        supportStatus: "on",
        hasEmail: true,
      }),
    );
  });

  it.each([
    ["memberships", { hasMemberships: true }],
    ["expired_memberships", { hasExpiredMemberships: true }],
    ["cancellations", { hasCancellations: true }],
    ["reschedules", { hasReschedules: true }],
  ])("maps the %s segment to its repository filter", async (segment, expectedFilter) => {
    const { GET } = await import("./route");
    const res = await GET(new Request(`http://localhost/api/doctor/patients?segment=${segment}`));

    expect(res.status).toBe(200);
    expect(listClientsMock).toHaveBeenCalledWith(expect.objectContaining(expectedFilter));
  });

  it("returns guard response when no workspace is selected", async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: "forbidden" }), { status: 403 }),
    });

    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/doctor/patients"));

    expect(res.status).toBe(403);
    expect(listClientsMock).not.toHaveBeenCalled();
  });
});
