import { beforeEach, describe, expect, it, vi } from "vitest";

const requireDoctorWorkspaceApiContextMock = vi.hoisted(() => vi.fn());
const withDoctorWorkspacePrincipalMock = vi.hoisted(() => vi.fn((_: unknown, sourceOrFn: string | (() => unknown), maybeFn?: () => unknown) => {
  const fn = typeof sourceOrFn === "function" ? sourceOrFn : maybeFn;
  if (!fn) throw new Error("principal_callback_required");
  return fn();
}));
const buildAppDepsMock = vi.hoisted(() => vi.fn());
const loadDoctorAnalyticsAudienceMock = vi.hoisted(() => vi.fn());
const loadDoctorCommentPatientsMock = vi.hoisted(() => vi.fn());
const loadDoctorAllCommentPatientsMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorWorkspaceApiContext: () => requireDoctorWorkspaceApiContextMock(),
}));
vi.mock("@/app-layer/guards/doctorWorkspacePrincipal", () => ({
  withDoctorWorkspacePrincipal: (
    ctx: unknown,
    sourceOrFn: string | (() => unknown),
    maybeFn?: () => unknown,
  ) => {
    const fn = typeof sourceOrFn === "function" ? sourceOrFn : maybeFn;
    if (!fn) throw new Error("principal_callback_required");
    return withDoctorWorkspacePrincipalMock(ctx, fn);
  },
}));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: buildAppDepsMock,
}));
vi.mock("@/app-layer/analytics/loadAnalyticsAudience", () => ({
  loadDoctorAnalyticsAudience: loadDoctorAnalyticsAudienceMock,
}));
vi.mock("@/app/app/doctor/comments/loadDoctorCommentPatients", () => ({
  loadDoctorCommentPatients: loadDoctorCommentPatientsMock,
}));
vi.mock("@/app/app/doctor/comments/loadDoctorAllCommentPatients", () => ({
  loadDoctorAllCommentPatients: loadDoctorAllCommentPatientsMock,
}));

import { GET } from "./route";

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

describe("GET /api/doctor/comments/patients", () => {
  beforeEach(() => {
    requireDoctorWorkspaceApiContextMock.mockReset();
    withDoctorWorkspacePrincipalMock.mockClear();
    withDoctorWorkspacePrincipalMock.mockImplementation(
      (_: unknown, sourceOrFn: string | (() => unknown), maybeFn?: () => unknown) => {
        const fn = typeof sourceOrFn === "function" ? sourceOrFn : maybeFn;
        if (!fn) throw new Error("principal_callback_required");
        return fn();
      },
    );
    buildAppDepsMock.mockReset();
    loadDoctorAnalyticsAudienceMock.mockReset();
    loadDoctorCommentPatientsMock.mockReset();
    loadDoctorAllCommentPatientsMock.mockReset();

    requireDoctorWorkspaceApiContextMock.mockResolvedValue({ ok: true, ctx: workspaceCtx });
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: {},
      programItemDiscussion: {},
    });
    loadDoctorAnalyticsAudienceMock.mockResolvedValue({
      excludedUserIds: ["40000000-0000-4000-8000-000000000004"],
    });
    loadDoctorCommentPatientsMock.mockResolvedValue([{ patientUserId: "p1" }]);
    loadDoctorAllCommentPatientsMock.mockResolvedValue([{ patientUserId: "p2" }]);
  });

  it("loads unread patients inside the selected workspace principal", async () => {
    const res = await GET(new Request("http://localhost/api/doctor/comments/patients"));

    expect(res.status).toBe(200);
    expect(loadDoctorCommentPatientsMock).toHaveBeenCalledWith(
      expect.objectContaining({ doctorClientsPort: expect.any(Object) }),
      { viewerUserId: doctorUserId, organizationId },
      { excludedUserIds: ["40000000-0000-4000-8000-000000000004"] },
    );
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId }),
      expect.any(Function),
    );
  });

  it("loads all patients with the same selected organization context", async () => {
    const res = await GET(new Request("http://localhost/api/doctor/comments/patients?mode=all"));

    expect(res.status).toBe(200);
    expect(loadDoctorAllCommentPatientsMock).toHaveBeenCalledWith(
      expect.any(Object),
      { viewerUserId: doctorUserId, organizationId },
      { excludedUserIds: ["40000000-0000-4000-8000-000000000004"] },
    );
  });

  it("returns workspace guard response", async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: "forbidden" }), { status: 403 }),
    });

    const res = await GET(new Request("http://localhost/api/doctor/comments/patients"));

    expect(res.status).toBe(403);
    expect(loadDoctorCommentPatientsMock).not.toHaveBeenCalled();
  });
});
