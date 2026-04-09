/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock, moveFolderMock, renameFolderMock, deleteFolderMock, pgExistsMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  moveFolderMock: vi.fn(),
  renameFolderMock: vi.fn(),
  deleteFolderMock: vi.fn(),
  pgExistsMock: vi.fn(),
}));

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: getSessionMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    media: {
      moveFolder: moveFolderMock,
      renameFolder: renameFolderMock,
      deleteFolder: deleteFolderMock,
    },
  }),
}));

vi.mock("@/infra/repos/mediaFoldersRepo", () => ({
  pgFolderExists: (...a: unknown[]) => pgExistsMock(...a),
}));

import { DELETE, PATCH } from "./route";

const FOLDER_ID = "11111111-1111-4111-8111-111111111111";
const PARENT_ID = "22222222-2222-4222-8222-222222222222";

describe("PATCH /api/admin/media/folders/[id]", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    moveFolderMock.mockReset();
    renameFolderMock.mockReset();
    deleteFolderMock.mockReset();
    pgExistsMock.mockReset();
    getSessionMock.mockResolvedValue({ user: { role: "doctor" } });
  });

  it("returns 400 for self parent", async () => {
    const res = await PATCH(
      new Request("http://localhost/api/admin/media/folders/x", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ parentId: FOLDER_ID }),
      }),
      { params: Promise.resolve({ id: FOLDER_ID }) },
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when new parent missing", async () => {
    pgExistsMock.mockResolvedValue(false);
    const res = await PATCH(
      new Request("http://localhost/api/admin/media/folders/x", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ parentId: PARENT_ID }),
      }),
      { params: Promise.resolve({ id: FOLDER_ID }) },
    );
    expect(res.status).toBe(404);
  });

  it("returns 200 on rename", async () => {
    renameFolderMock.mockResolvedValue(true);
    const res = await PATCH(
      new Request("http://localhost/api/admin/media/folders/x", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "NewName" }),
      }),
      { params: Promise.resolve({ id: FOLDER_ID }) },
    );
    expect(res.status).toBe(200);
    expect(renameFolderMock).toHaveBeenCalledWith(FOLDER_ID, "NewName");
  });
});

describe("DELETE /api/admin/media/folders/[id]", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    deleteFolderMock.mockReset();
    getSessionMock.mockResolvedValue({ user: { role: "doctor" } });
  });

  it("returns 409 when folder not empty", async () => {
    deleteFolderMock.mockResolvedValue({ ok: false as const, error: "not_empty" as const });
    const res = await DELETE(new Request("http://localhost/api/admin/media/folders/x"), {
      params: Promise.resolve({ id: FOLDER_ID }),
    });
    expect(res.status).toBe(409);
    const j = (await res.json()) as { error?: string };
    expect(j.error).toBe("not_empty");
  });

  it("returns 200 when delete ok", async () => {
    deleteFolderMock.mockResolvedValue({ ok: true as const });
    const res = await DELETE(new Request("http://localhost/api/admin/media/folders/x"), {
      params: Promise.resolve({ id: FOLDER_ID }),
    });
    expect(res.status).toBe(200);
    const j = (await res.json()) as { ok: boolean; deleted?: boolean };
    expect(j.ok).toBe(true);
    expect(j.deleted).toBe(true);
  });
});
