/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock, listFoldersMock, listAllMock, createFolderMock, pgExistsMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  listFoldersMock: vi.fn(),
  listAllMock: vi.fn(),
  createFolderMock: vi.fn(),
  pgExistsMock: vi.fn(),
}));

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: getSessionMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    media: {
      listFolders: listFoldersMock,
      listAllFolders: listAllMock,
      createFolder: createFolderMock,
    },
  }),
}));

vi.mock("@/infra/repos/mediaFoldersRepo", () => ({
  pgFolderExists: (...a: unknown[]) => pgExistsMock(...a),
}));

import { GET, POST } from "./route";

describe("GET /api/admin/media/folders", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    listFoldersMock.mockReset();
    listAllMock.mockReset();
    createFolderMock.mockReset();
    pgExistsMock.mockReset();
  });

  it("returns 401 without session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/admin/media/folders"));
    expect(res.status).toBe(401);
  });

  it("returns flat list when flat=true", async () => {
    getSessionMock.mockResolvedValue({ user: { role: "doctor" } });
    listAllMock.mockResolvedValue([{ id: "f1", parentId: null, name: "A", createdAt: "2026-01-01T00:00:00.000Z" }]);
    const res = await GET(new Request("http://localhost/api/admin/media/folders?flat=true"));
    expect(res.status).toBe(200);
    const j = (await res.json()) as { ok: boolean; items?: unknown[] };
    expect(j.ok).toBe(true);
    expect(j.items).toHaveLength(1);
    expect(listAllMock).toHaveBeenCalled();
  });

  it("returns children for parentId", async () => {
    getSessionMock.mockResolvedValue({ user: { role: "doctor" } });
    const pid = "11111111-1111-4111-8111-111111111111";
    listFoldersMock.mockResolvedValue([]);
    const res = await GET(new Request(`http://localhost/api/admin/media/folders?parentId=${pid}`));
    expect(res.status).toBe(200);
    expect(listFoldersMock).toHaveBeenCalledWith(pid);
  });
});

describe("POST /api/admin/media/folders", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    createFolderMock.mockReset();
    pgExistsMock.mockReset();
    getSessionMock.mockResolvedValue({ user: { userId: "u1", role: "doctor" } });
  });

  it("returns 404 when parent missing", async () => {
    pgExistsMock.mockResolvedValue(false);
    const pid = "11111111-1111-4111-8111-111111111111";
    const res = await POST(
      new Request("http://localhost/api/admin/media/folders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Sub", parentId: pid }),
      }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 200 when create succeeds", async () => {
    pgExistsMock.mockResolvedValue(true);
    createFolderMock.mockResolvedValue({
      id: "22222222-2222-4222-8222-222222222222",
      parentId: "11111111-1111-4111-8111-111111111111",
      name: "Sub",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const pid = "11111111-1111-4111-8111-111111111111";
    const res = await POST(
      new Request("http://localhost/api/admin/media/folders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Sub", parentId: pid }),
      }),
    );
    expect(res.status).toBe(200);
    const j = (await res.json()) as { ok: boolean; folder?: { name: string } };
    expect(j.ok).toBe(true);
    expect(j.folder?.name).toBe("Sub");
  });
});
