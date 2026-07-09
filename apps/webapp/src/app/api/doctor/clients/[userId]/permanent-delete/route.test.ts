import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const purgeMock = vi.fn();

const {
  getSessionMock,
  requireDoctorWorkspaceApiContextMock,
  buildAppDepsMock,
  getPlatformUserRoleMock,
  getClientIdentityMock,
  getClientIdentityForOrganizationMock,
} = vi.hoisted(() => {
  const getPlatformUserRoleMockInner = vi.fn();
  const getClientIdentityMockInner = vi.fn();
  const getClientIdentityForOrganizationMockInner = vi.fn();
  return {
    getSessionMock: vi.fn(),
    requireDoctorWorkspaceApiContextMock: vi.fn(),
    getPlatformUserRoleMock: getPlatformUserRoleMockInner,
    getClientIdentityMock: getClientIdentityMockInner,
    getClientIdentityForOrganizationMock: getClientIdentityForOrganizationMockInner,
    buildAppDepsMock: vi.fn(() => ({
      doctorClientsPort: {
        getPlatformUserRole: getPlatformUserRoleMockInner,
        getClientIdentity: getClientIdentityMockInner,
        getClientIdentityForOrganization: getClientIdentityForOrganizationMockInner,
      },
    })),
  };
});

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: buildAppDepsMock,
}));
vi.mock("@/app-layer/merge/strictPlatformUserPurge", () => ({
  runStrictPurgePlatformUser: (...args: unknown[]) => purgeMock(...args),
}));
vi.mock("@/modules/auth/requireAdminMode", () => ({
  requireAdminModeSession: getSessionMock,
}));
vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorWorkspaceApiContext: () => requireDoctorWorkspaceApiContextMock(),
}));

import { POST } from "./route";

const uid = "00000000-0000-4000-8000-000000000001";
const canonicalUid = "00000000-0000-4000-8000-000000000002";
const organizationId = "10000000-0000-4000-8000-000000000001";

const adminModeOk = {
  ok: true as const,
  session: {
    user: { userId: "a1", role: "admin" as const, displayName: "Admin", bindings: {} },
    adminMode: true,
    issuedAt: 0,
    expiresAt: 9_999_999_999,
  },
};

describe("POST /api/doctor/clients/[userId]/permanent-delete", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    requireDoctorWorkspaceApiContextMock.mockReset();
    getPlatformUserRoleMock.mockReset();
    getClientIdentityMock.mockReset();
    getClientIdentityForOrganizationMock.mockReset();
    purgeMock.mockReset();
    getPlatformUserRoleMock.mockResolvedValue("client");
    getSessionMock.mockResolvedValue(adminModeOk);
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId,
        session: adminModeOk.session,
      },
    });
    getClientIdentityForOrganizationMock.mockResolvedValue({ userId: canonicalUid });
  });

  it("returns 409 when client is not archived", async () => {
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
    const res = await POST(
      new Request(`http://localhost/api/doctor/clients/${uid}/permanent-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmUserId: uid }),
      }),
      { params: Promise.resolve({ userId: uid }) },
    );
    expect(res.status).toBe(409);
    expect(getClientIdentityForOrganizationMock).toHaveBeenCalledWith(uid, organizationId);
    expect(getClientIdentityMock).toHaveBeenCalledWith(canonicalUid);
    expect(purgeMock).not.toHaveBeenCalled();
  });

  it("purges when archived and confirmation matches", async () => {
    getClientIdentityMock.mockResolvedValue({
      userId: uid,
      displayName: "Test",
      phone: "+70000000000",
      bindings: {},
      createdAt: null,
      isBlocked: false,
      blockedReason: null,
      isArchived: true,
    });
    purgeMock.mockResolvedValue({
      ok: true,
      outcome: "completed",
      integratorSkipped: false,
      details: {
        intakeS3KeyCount: 0,
        mediaFileCount: 0,
        s3KeysAttempted: 0,
        s3Failures: [],
        integratorCleaned: true,
        integratorError: null,
        mediaRowsDeleted: 0,
        mediaRowDeleteErrors: [],
        intakeS3ObjectsNotDeletedBucketDisabled: false,
      },
    });

    const res = await POST(
      new Request(`http://localhost/api/doctor/clients/${uid}/permanent-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmUserId: uid }),
      }),
      { params: Promise.resolve({ userId: uid }) },
    );
    expect(res.status).toBe(200);
    expect(getPlatformUserRoleMock).toHaveBeenCalledWith(canonicalUid);
    expect(getClientIdentityMock).toHaveBeenCalledWith(canonicalUid);
    expect(purgeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        targetId: canonicalUid,
        actorId: "a1",
        audit: { enabled: true },
      }),
    );
  });

  it("returns 400 when confirmUserId mismatches URL", async () => {
    getClientIdentityMock.mockResolvedValue({
      userId: uid,
      displayName: "Test",
      phone: null,
      bindings: {},
      createdAt: null,
      isBlocked: false,
      blockedReason: null,
      isArchived: true,
    });
    const res = await POST(
      new Request(`http://localhost/api/doctor/clients/${uid}/permanent-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmUserId: "00000000-0000-4000-8000-000000000002" }),
      }),
      { params: Promise.resolve({ userId: uid }) },
    );
    expect(res.status).toBe(400);
    expect(getClientIdentityForOrganizationMock).not.toHaveBeenCalled();
    expect(purgeMock).not.toHaveBeenCalled();
  });

  it("returns 404 before purge checks when client is outside selected workspace", async () => {
    getClientIdentityForOrganizationMock.mockResolvedValueOnce(null);

    const res = await POST(
      new Request(`http://localhost/api/doctor/clients/${uid}/permanent-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmUserId: uid }),
      }),
      { params: Promise.resolve({ userId: uid }) },
    );

    expect(res.status).toBe(404);
    expect(getClientIdentityForOrganizationMock).toHaveBeenCalledWith(uid, organizationId);
    expect(getPlatformUserRoleMock).not.toHaveBeenCalled();
    expect(getClientIdentityMock).not.toHaveBeenCalled();
    expect(purgeMock).not.toHaveBeenCalled();
  });

  it("returns 403 when not in admin mode", async () => {
    getSessionMock.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }),
    });
    const res = await POST(
      new Request(`http://localhost/api/doctor/clients/${uid}/permanent-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmUserId: uid }),
      }),
      { params: Promise.resolve({ userId: uid }) },
    );
    expect(res.status).toBe(403);
    expect(requireDoctorWorkspaceApiContextMock).not.toHaveBeenCalled();
    expect(purgeMock).not.toHaveBeenCalled();
  });
});
