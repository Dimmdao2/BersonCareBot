/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaWriteOptions } from "@/modules/media/service";

const {
  getSessionMock,
  requireAdminWorkspaceApiContextMock,
  withDoctorWorkspacePrincipalMock,
  principalState,
  listFoldersMock,
  listAllMock,
  createFolderMock,
  pgExistsMock,
} = vi.hoisted(() => {
  const principalState = { inside: false };
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
    listFoldersMock: vi.fn(),
    listAllMock: vi.fn(),
    createFolderMock: vi.fn(),
    pgExistsMock: vi.fn(),
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
  buildAppDeps: () => ({
    media: {
      listFolders: listFoldersMock,
      listAllFolders: listAllMock,
      createFolder: createFolderMock,
    },
  }),
}));

vi.mock("@/app-layer/media/mediaFoldersRepo", () => ({
  pgFolderExists: (...a: unknown[]) => pgExistsMock(...a),
}));

const validateParentMock = vi.fn();
vi.mock("@/app-layer/media/clientMediaFolders", () => ({
  pgValidateManualFolderParent: (...a: unknown[]) => validateParentMock(...a),
}));

import { GET, POST } from "./route";

const adminWorkspace = {
  organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  session: {
    user: {
      userId: "admin-1",
    },
  },
};

describe("GET /api/admin/media/folders", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    listFoldersMock.mockReset();
    listAllMock.mockReset();
    createFolderMock.mockReset();
    pgExistsMock.mockReset();
    validateParentMock.mockReset();
    validateParentMock.mockResolvedValue({ ok: true });
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
    validateParentMock.mockReset();
    requireAdminWorkspaceApiContextMock.mockReset();
    withDoctorWorkspacePrincipalMock.mockClear();
    principalState.inside = false;
    validateParentMock.mockResolvedValue({ ok: true });
    requireAdminWorkspaceApiContextMock.mockResolvedValue({ ok: true, ctx: adminWorkspace });
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

  it("returns 409 when parent is system-managed folder", async () => {
    const pid = "11111111-1111-4111-8111-111111111111";
    validateParentMock.mockResolvedValue({ ok: false, error: "system_folder_readonly" });
    const res = await POST(
      new Request("http://localhost/api/admin/media/folders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Sub", parentId: pid }),
      }),
    );
    expect(res.status).toBe(409);
    expect(createFolderMock).not.toHaveBeenCalled();
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
    expect(createFolderMock).toHaveBeenCalledWith(
      {
        name: "Sub",
        parentId: pid,
        createdBy: "admin-1",
      },
      expect.objectContaining({ runMediaWrite: expect.any(Function) }),
    );
  });

  it("runs create inside admin media folder principal option", async () => {
    pgExistsMock.mockResolvedValue(true);
    createFolderMock.mockImplementation(async (_input: unknown, options: MediaWriteOptions) => {
      expect(principalState.inside).toBe(false);
      expect(options.runMediaWrite).toBeDefined();
      return options.runMediaWrite!(async () => {
        expect(principalState.inside).toBe(true);
        return {
          id: "22222222-2222-4222-8222-222222222222",
          parentId: null,
          name: "Sub",
          createdAt: "2026-01-01T00:00:00.000Z",
        };
      });
    });

    const res = await POST(
      new Request("http://localhost/api/admin/media/folders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Sub" }),
      }),
    );

    expect(res.status).toBe(200);
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      adminWorkspace,
      "admin.media.folders.create",
      expect.any(Function),
    );
  });
});
