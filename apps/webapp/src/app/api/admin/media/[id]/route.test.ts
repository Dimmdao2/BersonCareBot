import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaWriteOptions } from "@/modules/media/service";

const {
  getSessionMock,
  requireAdminWorkspaceApiContextMock,
  withDoctorWorkspacePrincipalMock,
  principalState,
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
  const principalState = { inside: false };
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
    requireAdminWorkspaceApiContextMock: vi.fn(),
    withDoctorWorkspacePrincipalMock: vi.fn(
      async <T,>(_workspace: { organizationId: string }, _source: string, fn: () => Promise<T>) => {
        principalState.inside = true;
        try {
          return await fn();
        } finally {
          principalState.inside = false;
        }
      },
    ),
    principalState,
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

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorWorkspaceApiContext: requireAdminWorkspaceApiContextMock,
}));

vi.mock("@/app-layer/principal/withOrganizationPrincipal", () => ({
  withDoctorWorkspacePrincipal: withDoctorWorkspacePrincipalMock,
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
const adminWorkspace = {
  organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  session: {
    user: {
      userId: "admin-1",
    },
  },
};

function gateResponse(status: number) {
  return new Response(JSON.stringify({ ok: false }), { status });
}

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
    requireAdminWorkspaceApiContextMock.mockReset();
    withDoctorWorkspacePrincipalMock.mockClear();
    principalState.inside = false;
    findUsageMock.mockReset();
    deleteHardMock.mockReset();
    updateDisplayNameMock.mockReset();
    getByIdMock.mockReset();
    requireAdminWorkspaceApiContextMock.mockResolvedValue({ ok: true, ctx: adminWorkspace });
    deleteHardMock.mockResolvedValue(true);
  });

  it("returns 401 without session", async () => {
    requireAdminWorkspaceApiContextMock.mockResolvedValue({ ok: false, response: gateResponse(401) });
    const res = await DELETE(new Request(`http://localhost/api/admin/media/${mediaId}`), {
      params: Promise.resolve({ id: mediaId }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 for client role", async () => {
    requireAdminWorkspaceApiContextMock.mockResolvedValue({ ok: false, response: gateResponse(403) });
    const res = await DELETE(new Request(`http://localhost/api/admin/media/${mediaId}`), {
      params: Promise.resolve({ id: mediaId }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 409 when media is used and no confirmation", async () => {
    findUsageMock.mockResolvedValue([{ pageId: "p1", pageSlug: "slug-1", field: "image_url" }]);
    const res = await DELETE(new Request(`http://localhost/api/admin/media/${mediaId}?confirmDelete=true`), {
      params: Promise.resolve({ id: mediaId }),
    });
    expect(res.status).toBe(409);
    expect(deleteHardMock).not.toHaveBeenCalled();
  });

  it("deletes media with confirmation flag", async () => {
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
    expect(deleteHardMock).toHaveBeenCalledWith(
      mediaId,
      expect.objectContaining({ runMediaWrite: expect.any(Function) }),
    );
  });

  it("deletes discussion-only media when confirmUsed is set", async () => {
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
    expect(deleteHardMock).toHaveBeenCalledWith(
      mediaId,
      expect.objectContaining({ runMediaWrite: expect.any(Function) }),
    );
  });

  it("returns 404 if media already removed", async () => {
    findUsageMock.mockResolvedValue([]);
    deleteHardMock.mockResolvedValue(false);
    const res = await DELETE(new Request(`http://localhost/api/admin/media/${mediaId}?confirmDelete=true`), {
      params: Promise.resolve({ id: mediaId }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 409 when confirmDelete is missing", async () => {
    const res = await DELETE(new Request(`http://localhost/api/admin/media/${mediaId}`), {
      params: Promise.resolve({ id: mediaId }),
    });
    expect(res.status).toBe(409);
    expect(findUsageMock).not.toHaveBeenCalled();
    expect(deleteHardMock).not.toHaveBeenCalled();
  });

  it("renames media display name", async () => {
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
    expect(updateDisplayNameMock).toHaveBeenCalledWith(
      mediaId,
      "Видео для библиотеки",
      expect.objectContaining({ runMediaWrite: expect.any(Function) }),
    );
  });

  it("clears display name when empty string provided", async () => {
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
    expect(updateDisplayNameMock).toHaveBeenCalledWith(
      mediaId,
      null,
      expect.objectContaining({ runMediaWrite: expect.any(Function) }),
    );
  });

  it("clears display name when null provided", async () => {
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
    expect(updateDisplayNameMock).toHaveBeenCalledWith(
      mediaId,
      null,
      expect.objectContaining({ runMediaWrite: expect.any(Function) }),
    );
  });

  it("executes delete through the admin media principal option", async () => {
    findUsageMock.mockResolvedValue([]);
    deleteHardMock.mockImplementation(async (_mediaId: unknown, options: MediaWriteOptions) => {
      expect(principalState.inside).toBe(false);
      expect(options.runMediaWrite).toBeDefined();
      return options.runMediaWrite!(async () => {
        expect(principalState.inside).toBe(true);
        return true;
      });
    });

    const res = await DELETE(new Request(`http://localhost/api/admin/media/${mediaId}?confirmDelete=true`), {
      params: Promise.resolve({ id: mediaId }),
    });

    expect(res.status).toBe(200);
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      adminWorkspace,
      "admin.media.files.delete",
      expect.any(Function),
    );
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

    requireAdminWorkspaceApiContextMock.mockResolvedValue({ ok: true, ctx: adminWorkspace });
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
    expect(updateMediaFolderMock).toHaveBeenCalledWith(
      mediaId,
      anotherPatientFolderId,
      expect.objectContaining({ runMediaWrite: expect.any(Function) }),
    );
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
    expect(updateMediaFolderMock).toHaveBeenCalledWith(
      mediaId,
      anotherPatientFolderId,
      expect.objectContaining({ runMediaWrite: expect.any(Function) }),
    );
  });
});

describe("PATCH /api/admin/media/[id] — ST-09 displayName rename in patient folder", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    getByIdMock.mockReset();
    updateDisplayNameMock.mockReset();
    isInSubtreeMock.mockReset();

    requireAdminWorkspaceApiContextMock.mockResolvedValue({ ok: true, ctx: adminWorkspace });
    updateDisplayNameMock.mockResolvedValue(true);
  });

  it("renames video in patient folder — returns 200, not blocked by any folder guard", async () => {
    // File lives in a patient subtree folder (isInSubtree would return true if called)
    // but displayName-only PATCH must never invoke pgIsFolderInClientSubtree
    getByIdMock.mockResolvedValue({ id: mediaId, folderId: patientFolderId });

    const res = await PATCH(
      new Request(`http://localhost/api/admin/media/${mediaId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName: "Видео ЛФК для плеча" }),
      }),
      { params: Promise.resolve({ id: mediaId }) },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; displayName: string };
    expect(body.ok).toBe(true);
    expect(body.displayName).toBe("Видео ЛФК для плеча");
    expect(updateDisplayNameMock).toHaveBeenCalledWith(
      mediaId,
      "Видео ЛФК для плеча",
      expect.objectContaining({ runMediaWrite: expect.any(Function) }),
    );
    // The move-out guard must NOT have been consulted for a displayName-only change
    expect(isInSubtreeMock).not.toHaveBeenCalled();
  });

  it("rename in patient folder with null clears displayName — not blocked", async () => {
    getByIdMock.mockResolvedValue({ id: mediaId, folderId: patientFolderId });

    const res = await PATCH(
      new Request(`http://localhost/api/admin/media/${mediaId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName: null }),
      }),
      { params: Promise.resolve({ id: mediaId }) },
    );

    expect(res.status).toBe(200);
    expect(updateDisplayNameMock).toHaveBeenCalledWith(
      mediaId,
      null,
      expect.objectContaining({ runMediaWrite: expect.any(Function) }),
    );
    expect(isInSubtreeMock).not.toHaveBeenCalled();
  });
});
