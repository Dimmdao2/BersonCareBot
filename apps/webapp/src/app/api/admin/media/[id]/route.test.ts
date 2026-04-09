import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock, findUsageMock, deleteHardMock, updateDisplayNameMock, buildAppDepsMock } = vi.hoisted(() => {
  const findUsageMockInner = vi.fn().mockResolvedValue([]);
  const deleteHardMockInner = vi.fn().mockResolvedValue(true);
  const updateDisplayNameMockInner = vi.fn().mockResolvedValue(true);
  return {
    getSessionMock: vi.fn(),
    findUsageMock: findUsageMockInner,
    deleteHardMock: deleteHardMockInner,
    updateDisplayNameMock: updateDisplayNameMockInner,
    buildAppDepsMock: vi.fn(() => ({
      media: {
        findUsage: findUsageMockInner,
        deleteHard: deleteHardMockInner,
        updateDisplayName: updateDisplayNameMockInner,
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

import { DELETE, PATCH } from "./route";

const mediaId = "11111111-1111-4111-8111-111111111111";

describe("DELETE /api/admin/media/[id]", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    findUsageMock.mockReset();
    deleteHardMock.mockReset();
    updateDisplayNameMock.mockReset();
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
    const res = await DELETE(new Request(`http://localhost/api/admin/media/${mediaId}?confirmDelete=true`), {
      params: Promise.resolve({ id: mediaId }),
    });
    expect(res.status).toBe(409);
    expect(deleteHardMock).not.toHaveBeenCalled();
  });

  it("deletes media with confirmation flag", async () => {
    getSessionMock.mockResolvedValue({ user: { role: "admin" } });
    findUsageMock.mockResolvedValue([{ pageId: "p1", pageSlug: "slug-1", field: "video_url" }]);
    deleteHardMock.mockResolvedValue(true);
    const res = await DELETE(
      new Request(`http://localhost/api/admin/media/${mediaId}?confirmDelete=true&confirmUsed=true`),
      {
      params: Promise.resolve({ id: mediaId }),
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; scheduled?: boolean };
    expect(body.ok).toBe(true);
    expect(body.scheduled).toBe(true);
    expect(deleteHardMock).toHaveBeenCalledWith(mediaId);
  });

  it("returns 404 if media already removed", async () => {
    getSessionMock.mockResolvedValue({ user: { role: "admin" } });
    findUsageMock.mockResolvedValue([]);
    deleteHardMock.mockResolvedValue(false);
    const res = await DELETE(new Request(`http://localhost/api/admin/media/${mediaId}?confirmDelete=true`), {
      params: Promise.resolve({ id: mediaId }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 409 when confirmDelete is missing", async () => {
    getSessionMock.mockResolvedValue({ user: { role: "admin" } });
    const res = await DELETE(new Request(`http://localhost/api/admin/media/${mediaId}`), {
      params: Promise.resolve({ id: mediaId }),
    });
    expect(res.status).toBe(409);
    expect(findUsageMock).not.toHaveBeenCalled();
    expect(deleteHardMock).not.toHaveBeenCalled();
  });

  it("renames media display name", async () => {
    getSessionMock.mockResolvedValue({ user: { role: "admin" } });
    updateDisplayNameMock.mockResolvedValue(true);
    const res = await PATCH(
      new Request(`http://localhost/api/admin/media/${mediaId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName: "Видео для библиотеки" }),
      }),
      {
        params: Promise.resolve({ id: mediaId }),
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; displayName: string };
    expect(body.ok).toBe(true);
    expect(body.displayName).toBe("Видео для библиотеки");
    expect(updateDisplayNameMock).toHaveBeenCalledWith(mediaId, "Видео для библиотеки");
  });

  it("clears display name when empty string provided", async () => {
    getSessionMock.mockResolvedValue({ user: { role: "doctor" } });
    updateDisplayNameMock.mockResolvedValue(true);
    const res = await PATCH(
      new Request(`http://localhost/api/admin/media/${mediaId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName: "   " }),
      }),
      {
        params: Promise.resolve({ id: mediaId }),
      },
    );
    expect(res.status).toBe(200);
    expect(updateDisplayNameMock).toHaveBeenCalledWith(mediaId, null);
  });

  it("clears display name when null provided", async () => {
    getSessionMock.mockResolvedValue({ user: { role: "doctor" } });
    updateDisplayNameMock.mockResolvedValue(true);
    const res = await PATCH(
      new Request(`http://localhost/api/admin/media/${mediaId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName: null }),
      }),
      {
        params: Promise.resolve({ id: mediaId }),
      },
    );
    expect(res.status).toBe(200);
    expect(updateDisplayNameMock).toHaveBeenCalledWith(mediaId, null);
  });
});
