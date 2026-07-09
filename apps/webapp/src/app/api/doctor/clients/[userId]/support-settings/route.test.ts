import { describe, expect, it, vi } from "vitest";

const requireDoctorWorkspaceApiContextMock = vi.hoisted(() => vi.fn());
const withDoctorWorkspacePrincipalMock = vi.hoisted(() => vi.fn());
const buildAppDepsMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorWorkspaceApiContext: requireDoctorWorkspaceApiContextMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: buildAppDepsMock,
}));

vi.mock("@/app-layer/principal/withOrganizationPrincipal", () => ({
  withDoctorWorkspacePrincipal: (...args: unknown[]) => withDoctorWorkspacePrincipalMock(...args),
}));

const patientUserId = "a0000000-0000-4000-8000-000000000001";
const organizationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const workspaceCtx = {
  session: { user: { userId: "doc-1", role: "doctor" } },
  organizationId,
  membershipId: "membership-1",
  membershipRole: "doctor",
  specialistId: "specialist-1",
  canManageOrganization: false,
  canManageAllSpecialists: false,
};

describe("doctor client support-settings route", () => {
  it("GET returns profile and effective policy", async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({ ok: true, ctx: workspaceCtx });
    withDoctorWorkspacePrincipalMock.mockImplementation(async (_ctx, _source, fn) => fn());
    const getClientSupport = vi.fn().mockResolvedValue({
      organizationId,
      patientUserId,
      onSupport: true,
      supportStartedAt: "2026-01-01",
      commentsEnabled: null,
      mediaEnabled: null,
      updatedAt: "2026-01-01",
      updatedBy: "doc-1",
    });
    const getPatientProgramInteractionPolicy = vi.fn().mockResolvedValue({
      organizationId,
      onSupport: true,
      commentsAllowed: true,
      mediaAllowed: false,
    });
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: {
        getClientIdentity: vi.fn().mockResolvedValue({ userId: patientUserId }),
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
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      workspaceCtx,
      "doctor.clients.support-settings.read",
      expect.any(Function),
    );
  });

  it("PATCH updates support profile", async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({ ok: true, ctx: workspaceCtx });
    withDoctorWorkspacePrincipalMock.mockImplementation(async (_ctx, _source, fn) => fn());
    const updateClientSupport = vi.fn().mockResolvedValue({
      organizationId,
      patientUserId,
      onSupport: false,
      supportStartedAt: null,
      commentsEnabled: true,
      mediaEnabled: null,
      updatedAt: "2026-01-02",
      updatedBy: "doc-1",
    });
    const getPatientProgramInteractionPolicy = vi.fn().mockResolvedValue({
      organizationId,
      onSupport: false,
      commentsAllowed: true,
      mediaAllowed: false,
    });
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: {
        getClientIdentity: vi.fn().mockResolvedValue({ userId: patientUserId }),
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
      patientUserId,
      onSupport: false,
      commentsEnabled: true,
      actorId: "doc-1",
    });
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      workspaceCtx,
      "doctor.clients.support-settings.update",
      expect.any(Function),
    );
  });
});
