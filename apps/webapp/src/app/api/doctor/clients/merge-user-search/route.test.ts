import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock, searchMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  searchMock: vi.fn(),
}));

vi.mock("@/modules/auth/requireAdminMode", () => ({
  requireAdminModeSession: getSessionMock,
}));
vi.mock("@/infra/db/client", () => ({
  getPool: () => ({}),
}));
vi.mock("@/infra/platformUserMergePreview", () => ({
  searchMergeUsersForManualMerge: (...args: unknown[]) => searchMock(...args),
}));

import { GET } from "./route";

const adminOk = {
  ok: true as const,
  session: {
    user: { userId: "a1", role: "admin" as const, displayName: "Admin", bindings: {} },
    adminMode: true,
    issuedAt: 0,
    expiresAt: 9_999_999_999,
  },
};

describe("GET /api/doctor/clients/merge-user-search", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    searchMock.mockReset();
    getSessionMock.mockResolvedValue(adminOk);
  });

  it("returns 403 when forbidden", async () => {
    getSessionMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false }), { status: 403 }),
    });
    const res = await GET(new Request("http://localhost/api?q=x"));
    expect(res.status).toBe(403);
  });

  it("returns empty users when q empty", async () => {
    searchMock.mockResolvedValue([]);
    const res = await GET(new Request("http://localhost/api"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; users: unknown[] };
    expect(body.ok).toBe(true);
    expect(body.users).toEqual([]);
    expect(searchMock).toHaveBeenCalledWith(expect.anything(), "", 50);
  });

  it("returns users from search", async () => {
    const created = new Date("2021-06-01T12:00:00.000Z");
    searchMock.mockResolvedValue([
      {
        id: "00000000-0000-4000-8000-000000000002",
        display_name: "B",
        phone_normalized: "+7900",
        email: null,
        integrator_user_id: "5",
        created_at: created,
      },
    ]);
    const res = await GET(new Request("http://localhost/api?q=ivan&limit=10"));
    expect(res.status).toBe(200);
    expect(searchMock).toHaveBeenCalledWith(expect.anything(), "ivan", 10);
    const body = (await res.json()) as { users: Array<{ displayName: string }> };
    expect(body.users[0].displayName).toBe("B");
  });
});
