import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock, listMock, buildAppDepsMock } = vi.hoisted(() => {
  const listMockInner = vi.fn().mockResolvedValue([]);
  return {
    getSessionMock: vi.fn(),
    listMock: listMockInner,
    buildAppDepsMock: vi.fn(() => ({
      media: {
        list: listMockInner,
      },
    })),
  };
});

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: getSessionMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: buildAppDepsMock,
}));

import { GET } from "./route";

describe("GET /api/admin/media", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    listMock.mockReset();
  });

  it("returns 401 without session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/admin/media"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for client role", async () => {
    getSessionMock.mockResolvedValue({ user: { role: "client" } });
    const res = await GET(new Request("http://localhost/api/admin/media"));
    expect(res.status).toBe(403);
  });

  it("returns media list for doctor", async () => {
    getSessionMock.mockResolvedValue({ user: { role: "doctor" } });
    listMock.mockResolvedValue([
      {
        id: "11111111-1111-4111-8111-111111111111",
        kind: "image",
        mimeType: "image/jpeg",
        filename: "x.jpg",
        size: 10,
        userId: null,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    const res = await GET(
      new Request("http://localhost/api/admin/media?kind=image&sortBy=size&sortDir=asc&limit=10&offset=5")
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      items: Array<{ url: string }>;
      hasMore: boolean;
      nextOffset: number;
      limit: number;
      offset: number;
    };
    expect(body.ok).toBe(true);
    expect(body.items[0]?.url).toBe("/api/media/11111111-1111-4111-8111-111111111111");
    expect(body.limit).toBe(10);
    expect(body.offset).toBe(5);
    expect(body.nextOffset).toBe(6);
    expect(body.hasMore).toBe(false);
    expect(listMock).toHaveBeenCalledWith({
      kind: "image",
      query: "",
      sortBy: "size",
      sortDir: "asc",
      limit: 10,
      offset: 5,
    });
  });

  it("returns 400 for invalid query", async () => {
    getSessionMock.mockResolvedValue({ user: { role: "admin" } });
    const res = await GET(new Request("http://localhost/api/admin/media?sortBy=unknown"));
    expect(res.status).toBe(400);
  });
});
