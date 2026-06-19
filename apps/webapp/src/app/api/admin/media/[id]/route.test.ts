import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getSessionMock,
  findUsageMock,
  deleteHardMock,
  updateDisplayNameMock,
  updateMediaFolderMock,
  getByIdMock,
  buildAppDepsMock,
  validateFolderMock,
  folderExistsMock,
  isInSubtreeMock,
} = vi.hoisted(() => {
  const findUsageMockInner = vi.fn().mockResolvedValue([]);
  const deleteHardMockInner = vi.fn().mockResolvedValue(true);
  const updateDisplayNameMockInner = vi.fn().mockResolvedValue(true);
  const updateMediaFolderMockInner = vi.fn().mockResolvedValue(true);
  const getByIdMockInner = vi.fn();
  const validateFolderMockInner = vi.fn().mockResolvedValue({ ok: true });
  const folderExistsMockInner = vi.fn().mockResolvedValue(true);
  const isInSubtreeMockInner = vi.fn();
  return {
    getSessionMock: vi.fn(),
    findUsageMock: findUsageMockInner,
    deleteHardMock: deleteHardMockInner,
    updateDisplayNameMock: updateDisplayNameMockInner,
    updateMediaFolderMock: updateMediaFolderMockInner,
    getByIdMock: getByIdMockInner,
    buildAppDepsMock: vi.fn(() => ({
      media: {
        findUsage: findUsageMockInner,
        deleteHard: deleteHardMockInner,
        updateDisplayName: updateDisplayNameMockInner,
        updateMediaFolder: updateMediaFolderMockInner,
        getById: getByIdMockInner,
      },
    })),
    validateFolderMock: validateFolderMockInner,
    folderExistsMock: folderExistsMockInner,
    isInSubtreeMock: isInSubtreeMockInner,
  };
});

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: getSessionMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: buildAppDepsMock,
}));

vi.mock("@/app-layer/media/clientMediaFolders", () => ({
  pgValidateUserAssignableMediaFolder: (...a: unknown[]) => validateFolderMock(...a),
  pgIsFolderInClientSubtree: (...a: unknown[]) => isInSubtreeMock(...a),
}));

vi.mock("@/app-layer/media/mediaFoldersRepo", () => ({
  pgFolderExists: (...a: unknown[]) => folderExistsMock(...a),
}));

import { DELETE, GET, PATCH } from "./route";

const mediaId = "11111111-1111-4111-8111-111111111111";

describe("GET /api/admin/media/[id]", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    getByIdMock.mockReset();
  });

  it("returns 401 without session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await GET(new Request(`http://localhost/api/admin/media/${mediaId}`), {
      params: Promise.resolve({ id: mediaId }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 for client role", async () => {
    getSessionMock.mockResolvedValue({ user: { role: "client" } });
    const res = await GET(new Request(`http://localhost/api/admin/media/${mediaId}`), {
      params: Promise.resolve({ id: mediaId }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 404 when media is missing", async () => {
    getSessionMock.mockResolvedValue({ user: { role: "doctor" } });
    getByIdMock.mockResolvedValue(null);
    const res = await GET(new Request(`http://localhost/api/admin/media/${mediaId}`), {
      params: Promise.resolve({ id: mediaId }),
    });
    expect(res.status).toBe(404);
  });

  it("returns row json for doctor", async () => {
    getSessionMock.mockResolvedValue({ user: { role: "doctor" } });
    getByIdMock.mockResolvedValue({
      id: mediaId,
      kind: "image",
      mimeType: "image/png",
      filename: "a.png",
      size: 12,
      createdAt: "2026-01-01T00:00:00.000Z",
      previewStatus: "ready",
      previewSmUrl: `/api/media/${mediaId}/preview/sm`,
      previewMdUrl: `/api/media/${mediaId}/preview/md`,
    });
    const res = await GET(new Request(`http://localhost/api/admin/media/${mediaId}`), {
      params: Promise.resolve({ id: mediaId }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; item: { url: string; id: string } };
    expect(body.ok).toBe(true);
    expect(body.item.id).toBe(mediaId);
    expect(body.item.url).toBe(`/api/media/${mediaId}`);
  });
});

describe("DELETE /api/admin/media/[id]", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    findUsageMock.mockReset();
    deleteHardMock.mockReset();
    updateDisplayNameMock.mockReset();
    getByIdMock.mockReset();
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

  it("deletes discussion-only media when confirmUsed is set", async () => {
    getSessionMock.mockResolvedValue({ user: { role: "admin" } });
    findUsageMock.mockResolvedValue([
      {
        pageId: "m1",
        pageSlug: "program_item_discussion:stage-1",
        field: "program_item_discussion_media_only",
      },
    ]);
    deleteHardMock.mockResolvedValue(true);
    const res = await DELETE(
      new Request(`http://localhost/api/admin/media/${mediaId}?confirmDelete=true&confirmUsed=true`),
      {
        params: Promise.resolve({ id: mediaId }),
      },
    );
    expect(res.status).toBe(200);
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

const patientFolderId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const standardFolderId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const anotherPatientFolderId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

describe("PATCH /api/admin/media/[id] — ST-07 move-out gate", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    getByIdMock.mockReset();
    updateMediaFolderMock.mockReset();
    validateFolderMock.mockReset();
    folderExistsMock.mockReset();
    isInSubtreeMock.mockReset();

    getSessionMock.mockResolvedValue({ user: { role: "doctor" } });
    validateFolderMock.mockResolvedValue({ ok: true });
    folderExistsMock.mockResolvedValue(true);
    updateMediaFolderMock.mockResolvedValue(true);
  });

  it("returns 409 patient_folder_move_out when moving from client_patient folder to standard folder", async () => {
    // File lives in a patient subtree folder
    getByIdMock.mockResolvedValue({ id: mediaId, folderId: patientFolderId });
    // Source folder is in subtree, target is not
    isInSubtreeMock.mockImplementation((folderId: string) => {
      if (folderId === patientFolderId) return Promise.resolve(true);
      if (folderId === standardFolderId) return Promise.resolve(false);
      return Promise.resolve(false);
    });

    const res = await PATCH(
      new Request(`http://localhost/api/admin/media/${mediaId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ folderId: standardFolderId }),
      }),
      { params: Promise.resolve({ id: mediaId }) },
    );

    expect(res.status).toBe(409);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.error).toBe("patient_folder_move_out");
    expect(updateMediaFolderMock).not.toHaveBeenCalled();
  });

  it("allows intra-subtree move from one client_patient folder to another", async () => {
    // File lives in a patient subtree folder
    getByIdMock.mockResolvedValue({ id: mediaId, folderId: patientFolderId });
    // Both source and target are in the subtree
    isInSubtreeMock.mockResolvedValue(true);

    const res = await PATCH(
      new Request(`http://localhost/api/admin/media/${mediaId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ folderId: anotherPatientFolderId }),
      }),
      { params: Promise.resolve({ id: mediaId }) },
    );

    expect(res.status).toBe(200);
    expect(updateMediaFolderMock).toHaveBeenCalledWith(mediaId, anotherPatientFolderId);
  });

  it("does not trigger ST-07 gate when file is in a standard folder", async () => {
    // File lives in a standard (non-subtree) folder
    getByIdMock.mockResolvedValue({ id: mediaId, folderId: standardFolderId });
    // Source folder is not in subtree → gate must not block
    isInSubtreeMock.mockImplementation((folderId: string) => {
      if (folderId === standardFolderId) return Promise.resolve(false);
      return Promise.resolve(false);
    });

    const res = await PATCH(
      new Request(`http://localhost/api/admin/media/${mediaId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ folderId: anotherPatientFolderId }),
      }),
      { params: Promise.resolve({ id: mediaId }) },
    );

    expect(res.status).toBe(200);
    expect(updateMediaFolderMock).toHaveBeenCalledWith(mediaId, anotherPatientFolderId);
  });
});
