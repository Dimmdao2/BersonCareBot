import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAdminModeSessionMock, listAdminAuditLogMock, countOpenAutoMergeConflictsMock } = vi.hoisted(() => ({
  requireAdminModeSessionMock: vi.fn(),
  listAdminAuditLogMock: vi.fn(),
  countOpenAutoMergeConflictsMock: vi.fn(),
}));

vi.mock("@/modules/auth/requireAdminMode", () => ({
  requireAdminModeSession: requireAdminModeSessionMock,
}));

vi.mock("@/infra/db/client", () => ({
  getPool: vi.fn(() => ({})),
}));

vi.mock("@/infra/adminAuditLog", () => ({
  listAdminAuditLog: listAdminAuditLogMock,
  countOpenAutoMergeConflicts: countOpenAutoMergeConflictsMock,
}));

import { GET } from "./route";

describe("GET /api/admin/audit-log", () => {
  beforeEach(() => {
    requireAdminModeSessionMock.mockReset();
    listAdminAuditLogMock.mockReset();
    countOpenAutoMergeConflictsMock.mockReset();
    countOpenAutoMergeConflictsMock.mockResolvedValue(0);
  });

  it("returns 403 when not admin mode", async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false }), { status: 403 }),
    });
    const res = await GET(new Request("http://localhost/api/admin/audit-log"));
    expect(res.status).toBe(403);
  });

  it("returns 400 on invalid date query", async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: "a1", role: "admin" } },
    });
    const res = await GET(new Request("http://localhost/api/admin/audit-log?from=not-a-date"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when from is after to", async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: "a1", role: "admin" } },
    });
    const res = await GET(new Request("http://localhost/api/admin/audit-log?from=2026-04-10&to=2026-04-01"));
    expect(res.status).toBe(400);
  });

  it("returns list when authorized", async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: "a1", role: "admin" } },
    });
    listAdminAuditLogMock.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 50,
    });
    const res = await GET(new Request("http://localhost/api/admin/audit-log?page=1&limit=10"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; total: number; openAutoMergeConflictCount: number };
    expect(body.ok).toBe(true);
    expect(body.total).toBe(0);
    expect(body.openAutoMergeConflictCount).toBe(0);
    expect(listAdminAuditLogMock).toHaveBeenCalled();
    expect(countOpenAutoMergeConflictsMock).toHaveBeenCalled();
  });

  it("passes involvesPlatformUserId to list when valid uuid", async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: "a1", role: "admin" } },
    });
    listAdminAuditLogMock.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 50,
    });
    const uid = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const res = await GET(
      new Request(`http://localhost/api/admin/audit-log?involvesPlatformUserId=${encodeURIComponent(uid)}`),
    );
    expect(res.status).toBe(200);
    expect(listAdminAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ involvesPlatformUserId: uid }),
    );
  });
});
