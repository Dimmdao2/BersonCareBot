import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireAdminModeSessionMock,
  buildAppDepsMock,
  clearDeadForProbeMock,
  writeAuditLogMock,
  getPoolMock,
} = vi.hoisted(() => {
  const requireAdminModeSessionMock = vi.fn();
  const clearDeadForProbeMock = vi.fn();
  const writeAuditLogMock = vi.fn();
  const getPoolMock = vi.fn(() => ({ tag: "pool" }));
  const buildAppDepsMock = vi.fn(() => ({
    healthFailureArchive: {
      clearDeadForProbe: clearDeadForProbeMock,
    },
  }));
  return {
    requireAdminModeSessionMock,
    buildAppDepsMock,
    clearDeadForProbeMock,
    writeAuditLogMock,
    getPoolMock,
  };
});

vi.mock("@/modules/auth/requireAdminMode", () => ({
  requireAdminModeSession: requireAdminModeSessionMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: buildAppDepsMock,
}));

vi.mock("@/app-layer/admin/auditLog", () => ({
  writeAuditLog: (...a: unknown[]) => writeAuditLogMock(...a),
}));

vi.mock("@/app-layer/db/client", () => ({
  getPool: getPoolMock,
}));

import { POST } from "./route";

describe("POST /api/admin/health-failure-archive/clear", () => {
  beforeEach(() => {
    requireAdminModeSessionMock.mockReset();
    clearDeadForProbeMock.mockReset();
    buildAppDepsMock.mockClear();
    writeAuditLogMock.mockReset();
    getPoolMock.mockClear();
    writeAuditLogMock.mockResolvedValue(undefined);
  });

  it("returns 403 when gate fails", async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false }), { status: 403 }),
    });
    const res = await POST(
      new Request("http://localhost/api/admin/health-failure-archive/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ probe: "outgoing_delivery" }),
      }),
    );
    expect(res.status).toBe(403);
    expect(clearDeadForProbeMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid body", async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: "a1", role: "admin" } },
    });
    const res = await POST(
      new Request("http://localhost/api/admin/health-failure-archive/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ probe: "nope" }),
      }),
    );
    expect(res.status).toBe(400);
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("returns inserted/deleted, writes admin_audit_log, idempotent second call", async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: "a1", role: "admin" } },
    });
    clearDeadForProbeMock.mockResolvedValueOnce({ inserted: 2, deleted: 2 });
    const res1 = await POST(
      new Request("http://localhost/api/admin/health-failure-archive/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ probe: "outgoing_delivery" }),
      }),
    );
    expect(res1.status).toBe(200);
    const b1 = (await res1.json()) as { ok: boolean; inserted: number; deleted: number };
    expect(b1.ok).toBe(true);
    expect(b1.inserted).toBe(2);
    expect(b1.deleted).toBe(2);

    clearDeadForProbeMock.mockResolvedValueOnce({ inserted: 0, deleted: 0 });
    const res2 = await POST(
      new Request("http://localhost/api/admin/health-failure-archive/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ probe: "outgoing_delivery" }),
      }),
    );
    expect(res2.status).toBe(200);
    const b2 = (await res2.json()) as { ok: boolean; inserted: number; deleted: number };
    expect(b2.inserted).toBe(0);
    expect(b2.deleted).toBe(0);

    expect(writeAuditLogMock).toHaveBeenCalledTimes(2);
    expect(getPoolMock).toHaveBeenCalledTimes(2);
    expect(writeAuditLogMock).toHaveBeenNthCalledWith(
      1,
      { tag: "pool" },
      expect.objectContaining({
        actorId: "a1",
        action: "health_failure_archive_clear_dead",
        details: { probe: "outgoing_delivery", inserted: 2, deleted: 2 },
        status: "ok",
      }),
    );
    expect(writeAuditLogMock).toHaveBeenNthCalledWith(
      2,
      { tag: "pool" },
      expect.objectContaining({
        details: { probe: "outgoing_delivery", inserted: 0, deleted: 0 },
      }),
    );
  });
});
