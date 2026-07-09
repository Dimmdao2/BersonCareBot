/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaWriteOptions } from "@/modules/media/service";

const {
  getSessionMock,
  requireAdminWorkspaceApiContextMock,
  withDoctorWorkspacePrincipalMock,
  principalState,
  moveFolderMock,
  renameFolderMock,
  deleteFolderMock,
  pgExistsMock,
  pgGetByIdMock,
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
    moveFolderMock: vi.fn(),
    renameFolderMock: vi.fn(),
    deleteFolderMock: vi.fn(),
    pgExistsMock: vi.fn(),
    pgGetByIdMock: vi.fn(),
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
      moveFolder: moveFolderMock,
      renameFolder: renameFolderMock,
      deleteFolder: deleteFolderMock,
    },
  }),
}));

vi.mock("@/app-layer/media/mediaFoldersRepo", () => ({
  pgFolderExists: (...a: unknown[]) => pgExistsMock(...a),
  pgGetMediaFolderById: (...a: unknown[]) => pgGetByIdMock(...a),
}));

const validateParentMock = vi.fn();
const validatePatientFolderRenameMock = vi.fn();
vi.mock("@/app-layer/media/clientMediaFolders", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app-layer/media/clientMediaFolders")>();
  return {
    ...actual,
    pgValidateManualFolderParent: (...a: unknown[]) => validateParentMock(...a),
    pgValidatePatientFolderRename: (...a: unknown[]) => validatePatientFolderRenameMock(...a),
  };
});

import { DELETE, PATCH } from "./route";

const FOLDER_ID = "11111111-1111-4111-8111-111111111111";
const PARENT_ID = "22222222-2222-4222-8222-222222222222";
const adminWorkspace = {
  organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  session: {
    user: {
      userId: "admin-1",
    },
  },
};

const standardFolder = {
  id: FOLDER_ID,
  parentId: null,
  name: "Standard",
  kind: "standard" as const,
  patientUserId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("PATCH /api/admin/media/folders/[id]", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    moveFolderMock.mockReset();
    renameFolderMock.mockReset();
    deleteFolderMock.mockReset();
    pgExistsMock.mockReset();
    pgGetByIdMock.mockReset();
    pgGetByIdMock.mockResolvedValue(standardFolder);
    validateParentMock.mockReset();
    validateParentMock.mockResolvedValue({ ok: true });
    validatePatientFolderRenameMock.mockReset();
    validatePatientFolderRenameMock.mockResolvedValue(undefined);
    requireAdminWorkspaceApiContextMock.mockReset();
    requireAdminWorkspaceApiContextMock.mockResolvedValue({ ok: true, ctx: adminWorkspace });
    withDoctorWorkspacePrincipalMock.mockClear();
    principalState.inside = false;
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

  it("returns 409 when renaming client_files_root folder", async () => {
    pgGetByIdMock.mockResolvedValue({
      ...standardFolder,
      kind: "client_files_root",
      name: "Пациенты",
    });
    const res = await PATCH(
      new Request("http://localhost/api/admin/media/folders/x", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Hack" }),
      }),
      { params: Promise.resolve({ id: FOLDER_ID }) },
    );
    expect(res.status).toBe(409);
    const j = (await res.json()) as { error?: string };
    expect(j.error).toBe("system_folder_readonly");
    expect(renameFolderMock).not.toHaveBeenCalled();
  });

  it("returns 200 when renaming client_patient folder (rule 2: allowed)", async () => {
    pgGetByIdMock.mockResolvedValue({
      ...standardFolder,
      kind: "client_patient",
      name: "Иван · abcd1234",
    });
    renameFolderMock.mockResolvedValue(true);
    const res = await PATCH(
      new Request("http://localhost/api/admin/media/folders/x", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Иван Иванов" }),
      }),
      { params: Promise.resolve({ id: FOLDER_ID }) },
    );
    expect(res.status).toBe(200);
    expect(renameFolderMock).toHaveBeenCalledWith(
      FOLDER_ID,
      "Иван Иванов",
      expect.objectContaining({ runMediaWrite: expect.any(Function) }),
    );
  });

  it("returns 409 patient_folder_move_out when reparenting client_patient folder (rule 4: forbidden)", async () => {
    pgGetByIdMock.mockResolvedValue({
      ...standardFolder,
      kind: "client_patient",
      name: "Иван · abcd1234",
    });
    const res = await PATCH(
      new Request("http://localhost/api/admin/media/folders/x", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ parentId: PARENT_ID }),
      }),
      { params: Promise.resolve({ id: FOLDER_ID }) },
    );
    expect(res.status).toBe(409);
    const j = (await res.json()) as { error?: string };
    expect(j.error).toBe("patient_folder_move_out");
    expect(moveFolderMock).not.toHaveBeenCalled();
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
    expect(renameFolderMock).toHaveBeenCalledWith(
      FOLDER_ID,
      "NewName",
      expect.objectContaining({ runMediaWrite: expect.any(Function) }),
    );
  });

  it("runs rename inside admin media folder principal option", async () => {
    renameFolderMock.mockImplementation(async (_id: unknown, _name: unknown, options: MediaWriteOptions) => {
      expect(principalState.inside).toBe(false);
      expect(options.runMediaWrite).toBeDefined();
      return options.runMediaWrite!(async () => {
        expect(principalState.inside).toBe(true);
        return true;
      });
    });
    const res = await PATCH(
      new Request("http://localhost/api/admin/media/folders/x", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "NewName" }),
      }),
      { params: Promise.resolve({ id: FOLDER_ID }) },
    );

    expect(res.status).toBe(200);
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      adminWorkspace,
      "admin.media.folders.update",
      expect.any(Function),
    );
  });
});

describe("DELETE /api/admin/media/folders/[id]", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    deleteFolderMock.mockReset();
    pgGetByIdMock.mockReset();
    pgGetByIdMock.mockResolvedValue(standardFolder);
    validateParentMock.mockReset();
    validateParentMock.mockResolvedValue({ ok: true });
    requireAdminWorkspaceApiContextMock.mockReset();
    requireAdminWorkspaceApiContextMock.mockResolvedValue({ ok: true, ctx: adminWorkspace });
    withDoctorWorkspacePrincipalMock.mockClear();
    principalState.inside = false;
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
    expect(deleteFolderMock).toHaveBeenCalledWith(
      FOLDER_ID,
      expect.objectContaining({ runMediaWrite: expect.any(Function) }),
    );
  });

  it("runs delete inside admin media folder principal option", async () => {
    deleteFolderMock.mockImplementation(async (_id: unknown, options: MediaWriteOptions) => {
      expect(principalState.inside).toBe(false);
      expect(options.runMediaWrite).toBeDefined();
      return options.runMediaWrite!(async () => {
        expect(principalState.inside).toBe(true);
        return { ok: true as const };
      });
    });

    const res = await DELETE(new Request("http://localhost/api/admin/media/folders/x"), {
      params: Promise.resolve({ id: FOLDER_ID }),
    });

    expect(res.status).toBe(200);
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      adminWorkspace,
      "admin.media.folders.delete",
      expect.any(Function),
    );
  });
});
