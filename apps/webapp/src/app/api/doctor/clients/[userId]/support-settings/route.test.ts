import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentSessionMock = vi.hoisted(() => vi.fn());
const buildAppDepsMock = vi.hoisted(() => vi.fn());
const requireDoctorWorkspaceApiContextMock = vi.hoisted(() => vi.fn());
const withDoctorWorkspacePrincipalMock = vi.hoisted(() => vi.fn((_: unknown, fn: () => unknown) => fn()));

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: getCurrentSessionMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: buildAppDepsMock,
}));

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorWorkspaceApiContext: () => requireDoctorWorkspaceApiContextMock(),
}));

vi.mock("@/app-layer/guards/doctorWorkspacePrincipal", () => ({
  withDoctorWorkspacePrincipal: (ctx: unknown, fn: () => unknown) => withDoctorWorkspacePrincipalMock(ctx, fn),
}));

const patientUserId = "a0000000-0000-4000-8000-000000000001";
const canonicalPatientUserId = "a0000000-0000-4000-8000-000000000011";
const workspaceCtx = {
  session: { user: { userId: "doc-1", role: "doctor", bindings: {} } },
  organizationId: "b0000000-0000-4000-8000-000000000002",
  membershipId: "c0000000-0000-4000-8000-000000000003",
  membershipRole: "doctor",
  specialistId: null,
  canManageOrganization: false,
  canManageAllSpecialists: false,
};

describe("doctor client support-settings route", () => {
  beforeEach(() => {
    requireDoctorWorkspaceApiContextMock.mockReset();
    withDoctorWorkspacePrincipalMock.mockClear();
    withDoctorWorkspacePrincipalMock.mockImplementation((_: unknown, fn: () => unknown) => fn());
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({ ok: true, ctx: workspaceCtx });
  });

  it("GET returns profile and effective policy", async () => {
    getCurrentSessionMock.mockResolvedValue({ user: { userId: "doc-1", role: "doctor" } });
    const getClientSupport = vi.fn().mockResolvedValue({
      patientUserId: canonicalPatientUserId,
      onSupport: true,
      commentsEnabled: null,
      mediaEnabled: null,
      updatedAt: "2026-01-01",
      updatedBy: "doc-1",
    });
    const getPatientProgramInteractionPolicy = vi.fn().mockResolvedValue({
      onSupport: true,
      commentsAllowed: true,
      mediaAllowed: false,
    });
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: {
        getClientIdentityForOrganization: vi.fn().mockResolvedValue({ userId: canonicalPatientUserId }),
      },
      doctorClients: { getClientSupport, getPatientProgramInteractionPolicy },
    });

    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ userId: patientUserId }),
    });
    const json = (await res.json()) as {
      ok?: boolean;
      profile?: { onSupport?: boolean };
      effectivePolicy?: { mediaAllowed?: boolean };
    };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.profile?.onSupport).toBe(true);
    expect(json.effectivePolicy?.mediaAllowed).toBe(false);
    expect(getClientSupport).toHaveBeenCalledWith(canonicalPatientUserId);
    expect(getPatientProgramInteractionPolicy).toHaveBeenCalledWith(canonicalPatientUserId);
  });

  it("PATCH updates support profile", async () => {
    getCurrentSessionMock.mockResolvedValue({ user: { userId: "doc-1", role: "doctor" } });
    const updateClientSupport = vi.fn().mockResolvedValue({
      patientUserId: canonicalPatientUserId,
      onSupport: false,
      commentsEnabled: true,
      mediaEnabled: null,
      updatedAt: "2026-01-02",
      updatedBy: "doc-1",
    });
    const getPatientProgramInteractionPolicy = vi.fn().mockResolvedValue({
      onSupport: false,
      commentsAllowed: true,
      mediaAllowed: false,
    });
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: {
        getClientIdentityForOrganization: vi.fn().mockResolvedValue({ userId: canonicalPatientUserId }),
      },
      doctorClients: { updateClientSupport, getPatientProgramInteractionPolicy },
    });

    const { PATCH } = await import("./route");
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onSupport: false, commentsEnabled: true }),
      }),
      { params: Promise.resolve({ userId: patientUserId }) },
    );
    const json = (await res.json()) as { ok?: boolean; profile?: { onSupport?: boolean } };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.profile?.onSupport).toBe(false);
    expect(updateClientSupport).toHaveBeenCalledWith({
      patientUserId: canonicalPatientUserId,
      onSupport: false,
      commentsEnabled: true,
      actorId: "doc-1",
    });
  });
});
