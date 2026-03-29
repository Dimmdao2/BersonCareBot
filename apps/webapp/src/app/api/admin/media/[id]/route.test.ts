import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock, findUsageMock, deleteHardMock, buildAppDepsMock } = vi.hoisted(() => {
  const findUsageMockInner = vi.fn().mockResolvedValue([]);
  const deleteHardMockInner = vi.fn().mockResolvedValue(true);
  return {
    getSessionMock: vi.fn(),
    findUsageMock: findUsageMockInner,
    deleteHardMock: deleteHardMockInner,
    buildAppDepsMock: vi.fn(() => ({
      media: {
        findUsage: findUsageMockInner,
        deleteHard: deleteHardMockInner,
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

import { DELETE } from "./route";

const mediaId = "11111111-1111-4111-8111-111111111111";

describe("DELETE /api/admin/media/[id]", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    findUsageMock.mockReset();
    deleteHardMock.mockReset();
  });

  it("returns 401 without session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await DELETE(new Request(`http://localhost/api/admin/media/${mediaId}`), {
      params: Promise.resolve({ id: mediaId }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 for client role", async () => {
    getSessionMock.mockResolvedValue({ user: { role: "client" } });
    const res = await DELETE(new Request(`http://localhost/api/admin/media/${mediaId}`), {
      params: Promise.resolve({ id: mediaId }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 409 when media is used and no confirmation", async () => {
    getSessionMock.mockResolvedValue({ user: { role: "doctor" } });
    findUsageMock.mockResolvedValue([{ pageId: "p1", pageSlug: "slug-1", field: "image_url" }]);
    const res = await DELETE(new Request(`http://localhost/api/admin/media/${mediaId}`), {
      params: Promise.resolve({ id: mediaId }),
    });
    expect(res.status).toBe(409);
    expect(deleteHardMock).not.toHaveBeenCalled();
  });

  it("deletes media with confirmation flag", async () => {
    getSessionMock.mockResolvedValue({ user: { role: "admin" } });
    findUsageMock.mockResolvedValue([{ pageId: "p1", pageSlug: "slug-1", field: "video_url" }]);
    deleteHardMock.mockResolvedValue(true);
    const res = await DELETE(new Request(`http://localhost/api/admin/media/${mediaId}?confirmUsed=true`), {
      params: Promise.resolve({ id: mediaId }),
    });
    expect(res.status).toBe(200);
    expect(deleteHardMock).toHaveBeenCalledWith(mediaId);
  });

  it("returns 404 if media already removed", async () => {
    getSessionMock.mockResolvedValue({ user: { role: "admin" } });
    findUsageMock.mockResolvedValue([]);
    deleteHardMock.mockResolvedValue(false);
    const res = await DELETE(new Request(`http://localhost/api/admin/media/${mediaId}`), {
      params: Promise.resolve({ id: mediaId }),
    });
    expect(res.status).toBe(404);
  });
});
