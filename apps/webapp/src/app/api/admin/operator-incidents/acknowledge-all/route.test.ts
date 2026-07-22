import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  admin: vi.fn(), workspace: vi.fn(), principal: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
  acknowledge: vi.fn(), audit: vi.fn(), pool: { tag: "pool" },
}));
vi.mock("@/modules/auth/requireAdminMode", () => ({ requireAdminModeSession: mocks.admin }));
vi.mock("@/app-layer/guards/requireRole", () => ({ requireDoctorWorkspaceApiContext: mocks.workspace }));
vi.mock("@/app-layer/guards/doctorWorkspacePrincipal", () => ({
  withDoctorWorkspacePrincipal: (ctx: unknown, fn: () => unknown) => mocks.principal(ctx, fn),
}));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({ operatorHealthWrite: { acknowledgeOpenOutboundProviderIncidents: mocks.acknowledge } }),
}));
vi.mock("@/app-layer/admin/auditLog", () => ({ writeAuditLog: mocks.audit }));
vi.mock("@/app-layer/db/client", () => ({ getPool: () => mocks.pool }));

import { POST } from "./route";

describe("POST /api/admin/operator-incidents/acknowledge-all", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.admin.mockResolvedValue({ ok: true, session: { user: { userId: "admin-1" } } });
    mocks.workspace.mockResolvedValue({ ok: true, ctx: { organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } });
    mocks.acknowledge.mockResolvedValue({ acknowledged: 2 });
    mocks.audit.mockResolvedValue(undefined);
  });

  it("requires admin mode", async () => {
    mocks.admin.mockResolvedValueOnce({ ok: false, response: new Response(null, { status: 403 }) });
    expect((await POST()).status).toBe(403);
    expect(mocks.acknowledge).not.toHaveBeenCalled();
  });

  it("requires doctor workspace", async () => {
    mocks.workspace.mockResolvedValueOnce({ ok: false, response: new Response(null, { status: 403 }) });
    expect((await POST()).status).toBe(403);
    expect(mocks.acknowledge).not.toHaveBeenCalled();
  });

  it("durably acknowledges and audits", async () => {
    const response = await POST();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, acknowledged: 2 });
    expect(mocks.audit).toHaveBeenCalledWith(mocks.pool, expect.objectContaining({
      action: "operator_incidents_acknowledge_all", details: { acknowledged: 2 }, status: "ok",
    }));
  });
});
