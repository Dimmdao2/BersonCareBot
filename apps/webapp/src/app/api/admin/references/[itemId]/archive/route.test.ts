import { describe, expect, it, vi } from "vitest";

const { archiveMock, findItemMock, buildAppDepsMock, getSessionMock } = vi.hoisted(() => {
  const archiveMockInner = vi.fn();
  const findItemMockInner = vi.fn();
  const getSessionMockInner = vi.fn();
  return {
    archiveMock: archiveMockInner,
    findItemMock: findItemMockInner,
    getSessionMock: getSessionMockInner,
    buildAppDepsMock: vi.fn(() => ({
      references: {
        archiveItem: archiveMockInner,
        findItemById: findItemMockInner,
      },
    })),
  };
});

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: buildAppDepsMock,
}));
vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: getSessionMock,
}));

import { PATCH } from "./route";

describe("PATCH /api/admin/references/[itemId]/archive", () => {
  it("returns 403 for doctor", async () => {
    getSessionMock.mockResolvedValue({
      user: { userId: "d1", role: "doctor", displayName: "D", bindings: {} },
    });
    const res = await PATCH(new Request("http://localhost/api/admin/references/x/archive"), {
      params: Promise.resolve({ itemId: "x" }),
    });
    expect(res.status).toBe(403);
  });

  it("archives for admin", async () => {
    getSessionMock.mockResolvedValue({
      user: { userId: "a1", role: "admin", displayName: "A", bindings: {} },
    });
    findItemMock.mockResolvedValue({
      id: "it1",
      categoryId: "c",
      code: "x",
      title: "T",
      sortOrder: 1,
      isActive: true,
      deletedAt: null,
      metaJson: {},
    });
    const res = await PATCH(new Request("http://localhost/api/admin/references/it1/archive"), {
      params: Promise.resolve({ itemId: "it1" }),
    });
    expect(res.status).toBe(200);
    expect(archiveMock).toHaveBeenCalledWith("it1");
  });
});
