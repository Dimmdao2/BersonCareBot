import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock, searchMergeCandidatesMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  searchMergeCandidatesMock: vi.fn(),
}));

vi.mock("@/modules/auth/requireAdminMode", () => ({
  requireAdminModeSession: getSessionMock,
}));
vi.mock("@/app-layer/db/client", () => ({
  getPool: () => ({ query: vi.fn() }),
}));
vi.mock("@/app-layer/merge/platformUserMergePreview", () => ({
  searchMergeCandidates: (...args: unknown[]) => searchMergeCandidatesMock(...args),
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

const uid = "00000000-0000-4000-8000-000000000001";

describe("GET /api/doctor/clients/[userId]/merge-candidates", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    searchMergeCandidatesMock.mockReset();
    getSessionMock.mockResolvedValue(adminOk);
  });

  it("returns 400 invalid_user and does not call search when userId is not a uuid", async () => {
    const res = await GET(new Request(`http://localhost/api`), {
      params: Promise.resolve({ userId: "not-a-uuid" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_user");
    expect(searchMergeCandidatesMock).not.toHaveBeenCalled();
  });

  it("returns 400 when anchor is not client", async () => {
    searchMergeCandidatesMock.mockResolvedValue({
      ok: false,
      error: "not_client",
      message: "not client",
    });
    const res = await GET(new Request(`http://localhost/api`), { params: Promise.resolve({ userId: uid }) });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("not_client");
  });

  it("returns 409 when anchor is alias", async () => {
    searchMergeCandidatesMock.mockResolvedValue({
      ok: false,
      error: "is_alias",
      message: "alias",
    });
    const res = await GET(new Request(`http://localhost/api/x`), { params: Promise.resolve({ userId: uid }) });
    expect(res.status).toBe(409);
  });

  it("returns candidates when ok", async () => {
    const created = new Date("2021-06-01T12:00:00.000Z");
    searchMergeCandidatesMock.mockResolvedValue({
      ok: true,
      anchorUserId: uid,
      candidates: [
        {
          id: "00000000-0000-4000-8000-000000000002",
          display_name: "B",
          phone_normalized: "+7900",
          email: null,
          integrator_user_id: "5",
          created_at: created,
        },
      ],
    });
    const res = await GET(new Request(`http://localhost/api?q=test`), { params: Promise.resolve({ userId: uid }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      candidates: Array<{ id: string; displayName: string; createdAt: string }>;
    };
    expect(body.ok).toBe(true);
    expect(body.candidates).toHaveLength(1);
    expect(body.candidates[0].displayName).toBe("B");
    expect(body.candidates[0].createdAt).toBe(created.toISOString());
  });
});
