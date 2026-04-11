import { beforeEach, describe, expect, it, vi } from "vitest";

const poolQueryMock = vi.fn();
const patchMock = vi.fn();
const writeAuditLogMock = vi.fn();

const { getSessionMock, resolveCanonicalMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  resolveCanonicalMock: vi.fn(),
}));

vi.mock("@/modules/auth/requireAdminMode", () => ({
  requireAdminModeSession: getSessionMock,
}));
vi.mock("@/infra/db/client", () => ({
  getPool: () => ({ query: poolQueryMock }),
}));
vi.mock("@/infra/repos/pgCanonicalPlatformUser", () => ({
  resolveCanonicalUserId: (...args: unknown[]) => resolveCanonicalMock(...args),
}));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    userProjection: {
      patchAdminClientProfile: patchMock,
    },
  }),
}));
vi.mock("@/infra/adminAuditLog", () => ({
  writeAuditLog: (...args: unknown[]) => writeAuditLogMock(...args),
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
    writeAuditLogMock.mockReset();
    resolveCanonicalMock.mockReset();
    getSessionMock.mockResolvedValue(adminModeOk);
    resolveCanonicalMock.mockResolvedValue(uid);
    poolQueryMock.mockResolvedValue({ rows: [] });
    patchMock.mockResolvedValue({ ok: true as const });
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
    poolQueryMock.mockResolvedValueOnce({ rows: [{ id: "other" }] });
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
  });
});
