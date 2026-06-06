import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAdminModeSessionMock, buildAppDepsMock, listForAdminMock } = vi.hoisted(() => {
  const requireAdminModeSessionMock = vi.fn();
  const listForAdminMock = vi.fn();
  const buildAppDepsMock = vi.fn(() => ({
    healthFailureArchive: {
      listForAdmin: listForAdminMock,
    },
  }));
  return { requireAdminModeSessionMock, buildAppDepsMock, listForAdminMock };
});

vi.mock("@/modules/auth/requireAdminMode", () => ({
  requireAdminModeSession: requireAdminModeSessionMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: buildAppDepsMock,
}));

import { GET } from "./route";

describe("GET /api/admin/health-failure-archive", () => {
  beforeEach(() => {
    requireAdminModeSessionMock.mockReset();
    listForAdminMock.mockReset();
    buildAppDepsMock.mockClear();
    requireAdminModeSessionMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: "a1", role: "admin" } },
    });
  });

  it("returns 403 when gate fails", async () => {
    requireAdminModeSessionMock.mockResolvedValueOnce({
      ok: false,
      response: new Response(JSON.stringify({ ok: false }), { status: 403 }),
    });
    const res = await GET(new Request("http://localhost/api/admin/health-failure-archive"));
    expect(res.status).toBe(403);
    expect(listForAdminMock).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid probe query", async () => {
    const res = await GET(new Request("http://localhost/api/admin/health-failure-archive?probe=not-a-probe"));
    expect(res.status).toBe(400);
    expect(listForAdminMock).not.toHaveBeenCalled();
  });

  it("returns 200 and delegates listForAdmin", async () => {
    listForAdminMock.mockResolvedValue({
      items: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          archivedAt: "2026-05-17T10:00:00.000Z",
          archivedByUserId: "a1",
          healthProbe: "outgoing_delivery",
          sourceKind: "outgoing_delivery_queue_row",
          sourceId: "22222222-2222-4222-8222-222222222222",
          severityAtArchive: "dead",
          doctorUserId: null,
          summaryJson: { reason_ru: "Тест" },
          rawErrorTruncated: null,
        },
      ],
      nextCursor: "abc",
    });
    const res = await GET(
      new Request("http://localhost/api/admin/health-failure-archive?probe=outgoing_delivery&limit=10"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; items: unknown[]; nextCursor: string };
    expect(body.ok).toBe(true);
    expect(body.items).toHaveLength(1);
    expect(body.nextCursor).toBe("abc");
    expect(listForAdminMock).toHaveBeenCalledWith(
      expect.objectContaining({
        probe: "outgoing_delivery",
        limit: 10,
        cursor: null,
      }),
    );
  });

  it("passes cursor to listForAdmin", async () => {
    listForAdminMock.mockResolvedValue({ items: [], nextCursor: null });
    const res = await GET(
      new Request("http://localhost/api/admin/health-failure-archive?cursor=curs123"),
    );
    expect(res.status).toBe(200);
    expect(listForAdminMock).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: "curs123" }),
    );
  });

  it("accepts projection_outbox probe filter", async () => {
    listForAdminMock.mockResolvedValue({ items: [], nextCursor: null });
    const res = await GET(
      new Request("http://localhost/api/admin/health-failure-archive?probe=projection_outbox"),
    );
    expect(res.status).toBe(200);
    expect(listForAdminMock).toHaveBeenCalledWith(
      expect.objectContaining({ probe: "projection_outbox" }),
    );
  });
});
