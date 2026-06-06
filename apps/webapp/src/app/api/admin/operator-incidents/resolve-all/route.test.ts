import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireAdminModeSessionMock,
  buildAppDepsMock,
  resolveAllOpenIncidentsMock,
  writeAuditLogMock,
  getPoolMock,
} = vi.hoisted(() => {
  const requireAdminModeSessionMock = vi.fn();
  const resolveAllOpenIncidentsMock = vi.fn();
  const writeAuditLogMock = vi.fn();
  const getPoolMock = vi.fn(() => ({ tag: "pool" }));
  const buildAppDepsMock = vi.fn(() => ({
    operatorHealthWrite: {
      resolveAllOpenIncidents: resolveAllOpenIncidentsMock,
    },
  }));
  return {
    requireAdminModeSessionMock,
    buildAppDepsMock,
    resolveAllOpenIncidentsMock,
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

describe("POST /api/admin/operator-incidents/resolve-all", () => {
  beforeEach(() => {
    requireAdminModeSessionMock.mockReset();
    resolveAllOpenIncidentsMock.mockReset();
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
    const res = await POST();
    expect(res.status).toBe(403);
    expect(resolveAllOpenIncidentsMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("returns resolved count and writes admin_audit_log", async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: "a1", role: "admin" } },
    });
    resolveAllOpenIncidentsMock.mockResolvedValueOnce({ resolved: 2 });
    const res = await POST();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; resolved: number };
    expect(body.ok).toBe(true);
    expect(body.resolved).toBe(2);
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      { tag: "pool" },
      expect.objectContaining({
        actorId: "a1",
        action: "operator_incidents_resolve_all",
        details: { resolved: 2 },
        status: "ok",
      }),
    );
  });

  it("is idempotent when no open incidents", async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: "a1", role: "admin" } },
    });
    resolveAllOpenIncidentsMock.mockResolvedValueOnce({ resolved: 0 });
    const res = await POST();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; resolved: number };
    expect(body.resolved).toBe(0);
  });
});
