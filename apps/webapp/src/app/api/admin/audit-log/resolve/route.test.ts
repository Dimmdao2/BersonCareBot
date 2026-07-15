import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireAdminModeSessionMock,
  requireDoctorWorkspaceApiContextMock,
  withDoctorWorkspacePrincipalMock,
  resolveAdminAuditConflictByIdMock,
} = vi.hoisted(() => ({
  requireAdminModeSessionMock: vi.fn(),
  requireDoctorWorkspaceApiContextMock: vi.fn(),
  withDoctorWorkspacePrincipalMock: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
  resolveAdminAuditConflictByIdMock: vi.fn(),
}));

vi.mock("@/modules/auth/requireAdminMode", () => ({
  requireAdminModeSession: requireAdminModeSessionMock,
}));

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorWorkspaceApiContext: requireDoctorWorkspaceApiContextMock,
}));

vi.mock("@/app-layer/guards/doctorWorkspacePrincipal", () => ({
  withDoctorWorkspacePrincipal: (
    ctx: unknown,
    sourceOrFn: string | (() => unknown),
    maybeFn?: () => unknown,
  ) => {
    const fn = typeof sourceOrFn === "function" ? sourceOrFn : maybeFn;
    if (!fn) throw new Error("principal_callback_required");
    return withDoctorWorkspacePrincipalMock(ctx, fn);
  },
}));

vi.mock("@/app-layer/db/client", () => ({
  getPool: vi.fn(() => ({})),
}));

vi.mock("@/app-layer/admin/auditLog", () => ({
  resolveAdminAuditConflictById: resolveAdminAuditConflictByIdMock,
}));

import { POST } from "./route";

describe("POST /api/admin/audit-log/resolve", () => {
  beforeEach(() => {
    requireAdminModeSessionMock.mockReset();
    requireDoctorWorkspaceApiContextMock.mockReset();
    withDoctorWorkspacePrincipalMock.mockClear();
    resolveAdminAuditConflictByIdMock.mockReset();
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: true,
      ctx: { organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
    });
  });

  it("returns 403 when gate fails", async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false }), { status: 403 }),
    });
    const res = await POST(
      new Request("http://localhost/api/admin/audit-log/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "6ef47437-fbed-4d47-a3d4-de6a4ea609cb" }),
      }),
    );
    expect(res.status).toBe(403);
    expect(resolveAdminAuditConflictByIdMock).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid body", async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: "a1", role: "admin" } },
    });
    const res = await POST(
      new Request("http://localhost/api/admin/audit-log/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "not-a-uuid" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns workspace gate response before resolving audit row", async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: "a1", role: "admin" } },
    });
    requireDoctorWorkspaceApiContextMock.mockResolvedValueOnce({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: "doctor_workspace_membership_required" }), {
        status: 403,
      }),
    });
    const res = await POST(
      new Request("http://localhost/api/admin/audit-log/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "6ef47437-fbed-4d47-a3d4-de6a4ea609cb" }),
      }),
    );
    expect(res.status).toBe(403);
    expect(resolveAdminAuditConflictByIdMock).not.toHaveBeenCalled();
  });

  it("returns 200 when resolve succeeds", async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: "a1", role: "admin" } },
    });
    resolveAdminAuditConflictByIdMock.mockResolvedValue({ ok: true, updated: true });
    const res = await POST(
      new Request("http://localhost/api/admin/audit-log/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "6ef47437-fbed-4d47-a3d4-de6a4ea609cb" }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; updated?: boolean };
    expect(body.ok).toBe(true);
    expect(body.updated).toBe(true);
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
      expect.any(Function),
    );
  });
});
