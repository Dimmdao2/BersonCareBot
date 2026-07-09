import { beforeEach, describe, expect, it, vi } from "vitest";

const poolQueryMock = vi.fn();
const patchMock = vi.fn();
const getProfileEmailFieldsMock = vi.fn();
const findEmailConflictMock = vi.fn();
const findPhoneConflictMock = vi.fn();
const requestContactEmailSetupMock = vi.fn();
const writeAuditLogMock = vi.fn();

const {
  getSessionMock,
  resolveCanonicalMock,
  requireDoctorWorkspaceApiContextMock,
  withDoctorWorkspacePrincipalMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  resolveCanonicalMock: vi.fn(),
  requireDoctorWorkspaceApiContextMock: vi.fn(),
  withDoctorWorkspacePrincipalMock: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

vi.mock("@/modules/auth/requireAdminMode", () => ({
  requireAdminModeSession: getSessionMock,
}));
vi.mock("@/app-layer/db/client", () => ({
  getPool: () => ({ query: poolQueryMock }),
}));
vi.mock("@/app-layer/platform-user/canonicalPlatformUser", () => ({
  resolveCanonicalUserId: (...args: unknown[]) => resolveCanonicalMock(...args),
}));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    userProjection: {
      patchAdminClientProfile: patchMock,
      getProfileEmailFields: getProfileEmailFieldsMock,
      findPlatformUserIdWithEmailConflict: findEmailConflictMock,
      findPlatformUserIdWithPhoneConflict: findPhoneConflictMock,
    },
    emailSetupAccess: {
      requestContactEmailSetup: requestContactEmailSetupMock,
    },
  }),
}));
vi.mock("@/app-layer/admin/auditLog", () => ({
  writeAuditLog: (...args: unknown[]) => writeAuditLogMock(...args),
}));
vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorWorkspaceApiContext: requireDoctorWorkspaceApiContextMock,
}));
vi.mock("@/app-layer/guards/doctorWorkspacePrincipal", () => ({
  withDoctorWorkspacePrincipal: (ctx: unknown, fn: () => unknown) =>
    withDoctorWorkspacePrincipalMock(ctx, fn),
}));

import { PATCH } from "./route";

const uid = "00000000-0000-4000-8000-000000000001";

const adminModeOk = {
  ok: true as const,
  session: {
    user: { userId: "a1", role: "admin" as const, displayName: "Admin", bindings: {} },
    adminMode: true,
    issuedAt: 0,
    expiresAt: 9_999_999_999,
  },
};

describe("PATCH /api/admin/users/[userId]/profile", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    poolQueryMock.mockReset();
    patchMock.mockReset();
    getProfileEmailFieldsMock.mockReset();
    findEmailConflictMock.mockReset();
    findPhoneConflictMock.mockReset();
    requestContactEmailSetupMock.mockReset();
    writeAuditLogMock.mockReset();
    requireDoctorWorkspaceApiContextMock.mockReset();
    withDoctorWorkspacePrincipalMock.mockClear();
    resolveCanonicalMock.mockReset();
    getSessionMock.mockResolvedValue(adminModeOk);
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: true,
      ctx: { organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
    });
    resolveCanonicalMock.mockResolvedValue(uid);
    poolQueryMock.mockResolvedValue({ rows: [] });
    patchMock.mockResolvedValue({ ok: true as const });
    getProfileEmailFieldsMock.mockResolvedValue({ email: null, emailVerifiedAt: null });
    findEmailConflictMock.mockResolvedValue(null);
    findPhoneConflictMock.mockResolvedValue(null);
    requestContactEmailSetupMock.mockResolvedValue({ ok: true, status: "stub_pending_phase3" });
  });

  it("returns 400 for empty body", async () => {
    const res = await PATCH(
      new Request(`http://localhost/api/admin/users/${uid}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ userId: uid }) },
    );
    expect(res.status).toBe(400);
    const j = (await res.json()) as { error?: string };
    expect(j.error).toBe("empty_patch");
    expect(patchMock).not.toHaveBeenCalled();
  });

  it("returns 409 when email belongs to another user", async () => {
    findEmailConflictMock.mockResolvedValueOnce("other");
    const res = await PATCH(
      new Request(`http://localhost/api/admin/users/${uid}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "taken@example.com" }),
      }),
      { params: Promise.resolve({ userId: uid }) },
    );
    expect(res.status).toBe(409);
    expect(patchMock).not.toHaveBeenCalled();
  });

  it("returns workspace gate response before profile patch", async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValueOnce({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: "organization_selection_required" }), {
        status: 409,
      }),
    });
    const res = await PATCH(
      new Request(`http://localhost/api/admin/users/${uid}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: "Новое ФИО" }),
      }),
      { params: Promise.resolve({ userId: uid }) },
    );
    expect(res.status).toBe(409);
    expect(patchMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("enqueues contact email setup when doctor changes email", async () => {
    getProfileEmailFieldsMock.mockResolvedValueOnce({
      email: "old@example.com",
      emailVerifiedAt: "2020-01-01T00:00:00.000Z",
    });
    const res = await PATCH(
      new Request(`http://localhost/api/admin/users/${uid}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "new@example.com" }),
      }),
      { params: Promise.resolve({ userId: uid }) },
    );
    expect(res.status).toBe(200);
    expect(requestContactEmailSetupMock).toHaveBeenCalledWith({
      userId: uid,
      emailNormalized: "new@example.com",
      source: "doctor_profile",
      createdByUserId: "a1",
    });
  });

  it("does not enqueue setup when email is unchanged", async () => {
    getProfileEmailFieldsMock.mockResolvedValueOnce({
      email: "same@example.com",
      emailVerifiedAt: null,
    });
    const res = await PATCH(
      new Request(`http://localhost/api/admin/users/${uid}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "same@example.com" }),
      }),
      { params: Promise.resolve({ userId: uid }) },
    );
    expect(res.status).toBe(200);
    expect(requestContactEmailSetupMock).not.toHaveBeenCalled();
  });

  it("patches profile and writes audit", async () => {
    const res = await PATCH(
      new Request(`http://localhost/api/admin/users/${uid}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: "Новое ФИО" }),
      }),
      { params: Promise.resolve({ userId: uid }) },
    );
    expect(res.status).toBe(200);
    expect(patchMock).toHaveBeenCalledWith({
      platformUserId: uid,
      patch: { displayName: "Новое ФИО" },
    });
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actorId: "a1",
        action: "admin_client_profile_patch",
        targetId: uid,
        details: expect.objectContaining({ fields: ["displayName"] }),
      }),
    );
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
      expect.any(Function),
    );
  });
});
