import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const { getPlatformUserRoleMock, getClientIdentityMock, setUserArchivedMock } = vi.hoisted(() => {
  const getPlatformUserRoleMockInner = vi.fn();
  const getClientIdentityMockInner = vi.fn();
  const setUserArchivedMockInner = vi.fn();
  return {
    getPlatformUserRoleMock: getPlatformUserRoleMockInner,
    getClientIdentityMock: getClientIdentityMockInner,
    setUserArchivedMock: setUserArchivedMockInner,
  };
});
const requireDoctorWorkspaceApiContextMock = vi.hoisted(() => vi.fn());
const buildAppDepsMock = vi.hoisted(() => vi.fn());
const getClientIdentityForOrganizationMock = vi.hoisted(() => vi.fn());

vi.mock("@/infra/repos/pgDoctorClients", () => ({
  createPgDoctorClientsPort: () => ({
    getPlatformUserRole: getPlatformUserRoleMock,
    getClientIdentity: getClientIdentityMock,
    setUserArchived: setUserArchivedMock,
  }),
}));

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorWorkspaceApiContext: () => requireDoctorWorkspaceApiContextMock(),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => buildAppDepsMock(),
}));

import { PATCH } from "./route";

const uid = "00000000-0000-4000-8000-000000000001";
const organizationId = "10000000-0000-4000-8000-000000000001";

describe("PATCH /api/doctor/clients/[userId]/archive", () => {
  beforeEach(() => {
    requireDoctorWorkspaceApiContextMock.mockReset();
    buildAppDepsMock.mockReset();
    getClientIdentityForOrganizationMock.mockReset();
    getPlatformUserRoleMock.mockReset();
    getClientIdentityMock.mockReset();
    setUserArchivedMock.mockReset();
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId,
        session: { user: { userId: "d1", role: "doctor", bindings: {} } },
      },
    });
    getClientIdentityForOrganizationMock.mockResolvedValue({ userId: uid });
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: {
        getClientIdentityForOrganization: getClientIdentityForOrganizationMock,
      },
    });
    getPlatformUserRoleMock.mockResolvedValue("client");
    getClientIdentityMock.mockResolvedValue({
      userId: uid,
      displayName: "Test",
      phone: "+70000000000",
      bindings: {},
      createdAt: null,
      isBlocked: false,
      blockedReason: null,
      isArchived: false,
    });
  });

  it("returns workspace gate response when doctor workspace is unavailable", async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ ok: false, error: "doctor_workspace_membership_required" }, { status: 403 }),
    });
    const res = await PATCH(
      new Request(`http://localhost/api/doctor/clients/${uid}/archive`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: true }),
      }),
      { params: Promise.resolve({ userId: uid }) },
    );
    expect(res.status).toBe(403);
    expect(buildAppDepsMock).not.toHaveBeenCalled();
  });

  it("fails closed until organization-scoped archive exists", async () => {
    const res = await PATCH(
      new Request(`http://localhost/api/doctor/clients/${uid}/archive`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: true }),
      }),
      { params: Promise.resolve({ userId: uid }) },
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body).toEqual({ ok: false, error: "patient_archive_not_available" });
    expect(getClientIdentityForOrganizationMock).toHaveBeenCalledWith(uid, organizationId);
    expect(setUserArchivedMock).not.toHaveBeenCalled();
  });

  it("returns 404 when client is outside selected organization", async () => {
    getClientIdentityForOrganizationMock.mockResolvedValueOnce(null);
    const res = await PATCH(
      new Request(`http://localhost/api/doctor/clients/${uid}/archive`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: true }),
      }),
      { params: Promise.resolve({ userId: uid }) },
    );
    expect(res.status).toBe(404);
    expect(setUserArchivedMock).not.toHaveBeenCalled();
  });

  it("does not use the global platform role to authorize archive", async () => {
    getPlatformUserRoleMock.mockResolvedValueOnce("doctor");
    const res = await PATCH(
      new Request(`http://localhost/api/doctor/clients/${uid}/archive`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: true }),
      }),
      { params: Promise.resolve({ userId: uid }) },
    );
    expect(res.status).toBe(409);
    expect(getPlatformUserRoleMock).not.toHaveBeenCalled();
    expect(setUserArchivedMock).not.toHaveBeenCalled();
  });
});
