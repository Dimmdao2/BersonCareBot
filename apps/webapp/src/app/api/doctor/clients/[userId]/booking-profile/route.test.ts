import { beforeEach, describe, expect, it, vi } from "vitest";

const requireDoctorWorkspaceApiContextMock = vi.hoisted(() => vi.fn());
const withDoctorWorkspacePrincipalMock = vi.hoisted(() =>
  vi.fn(async <T,>(
    _workspace: { organizationId: string },
    _source: string,
    fn: () => Promise<T>,
  ) => fn()),
);
const buildAppDepsMock = vi.hoisted(() => vi.fn());
const getCurrentSessionMock = vi.hoisted(() => vi.fn());
const canAccessDoctorMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorWorkspaceApiContext: requireDoctorWorkspaceApiContextMock,
}));

vi.mock("@/app-layer/principal/withOrganizationPrincipal", () => ({
  withDoctorWorkspacePrincipal: withDoctorWorkspacePrincipalMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: buildAppDepsMock,
}));

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: getCurrentSessionMock,
}));

vi.mock("@/modules/roles/service", () => ({
  canAccessDoctor: canAccessDoctorMock,
}));

describe("doctor client booking-profile route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    canAccessDoctorMock.mockReturnValue(true);
    getCurrentSessionMock.mockResolvedValue({ user: { userId: "doc-1", role: "doctor" } });
  });

  it("GET stays role-only and uses the legacy default org read path", async () => {
    const getDefaultOrganizationId = vi.fn().mockResolvedValue("legacy-org");
    const getBookingProfile = vi.fn().mockResolvedValue({
      platformUserId: "user-1",
      organizationId: "legacy-org",
      isProblematic: false,
      bookingBlocked: false,
      problematicNote: null,
      updatedAt: "2026-01-01",
      updatedBy: "doc-1",
    });
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: {
        getClientIdentity: vi.fn().mockResolvedValue({ userId: "user-1" }),
      },
      bookingEngine: {
        organization: { getDefaultOrganizationId },
      },
      clientHistory: { getBookingProfile },
    });

    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ userId: "a0000000-0000-4000-8000-000000000001" }),
    });

    expect(res.status).toBe(200);
    expect(getCurrentSessionMock).toHaveBeenCalledTimes(1);
    expect(canAccessDoctorMock).toHaveBeenCalledWith("doctor");
    expect(requireDoctorWorkspaceApiContextMock).not.toHaveBeenCalled();
    expect(withDoctorWorkspacePrincipalMock).not.toHaveBeenCalled();
    expect(getDefaultOrganizationId).toHaveBeenCalledTimes(1);
    expect(getBookingProfile).toHaveBeenCalledWith(
      "legacy-org",
      "a0000000-0000-4000-8000-000000000001",
    );
  });

  it("PATCH updates profile", async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: "org-1",
        session: { user: { userId: "doc-1", role: "doctor" } },
      },
    });
    const upsertBookingProfile = vi.fn().mockResolvedValue({
      platformUserId: "user-1",
      organizationId: "org-1",
      isProblematic: true,
      bookingBlocked: false,
      problematicNote: null,
      updatedAt: "2026-01-01",
      updatedBy: "doc-1",
    });
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: {
        getClientIdentity: vi.fn().mockResolvedValue({ userId: "user-1" }),
      },
      bookingEngine: {
        organization: { getDefaultOrganizationId: vi.fn().mockResolvedValue("org-1") },
      },
      clientHistory: { upsertBookingProfile },
    });

    const { PATCH } = await import("./route");
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isProblematic: true }),
      }),
      { params: Promise.resolve({ userId: "a0000000-0000-4000-8000-000000000001" }) },
    );
    const json = (await res.json()) as { ok?: boolean; profile?: { isProblematic?: boolean } };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.profile?.isProblematic).toBe(true);
    expect(upsertBookingProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        updatedBy: "doc-1",
      }),
    );
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1" }),
      "doctor.clients.booking-profile.update",
      expect.any(Function),
    );
  });
});
