import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  archiveMock,
  findItemMock,
  buildAppDepsMock,
  requireAdminWorkspaceApiContextMock,
  withDoctorWorkspacePrincipalMock,
  principalState,
} = vi.hoisted(() => {
  const archiveMockInner = vi.fn();
  const findItemMockInner = vi.fn();
  const principalState = { inside: false };
  return {
    archiveMock: archiveMockInner,
    findItemMock: findItemMockInner,
    buildAppDepsMock: vi.fn(() => ({
      references: {
        archiveItem: archiveMockInner,
        findItemById: findItemMockInner,
      },
    })),
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
  };
});

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: buildAppDepsMock,
}));

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireAdminWorkspaceApiContext: requireAdminWorkspaceApiContextMock,
}));

vi.mock("@/app-layer/principal/withOrganizationPrincipal", () => ({
  withDoctorWorkspacePrincipal: withDoctorWorkspacePrincipalMock,
}));

import { PATCH } from "./route";

const adminWorkspace = {
  organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  session: {
    user: {
      userId: "admin-1",
    },
  },
};

describe("PATCH /api/admin/references/[itemId]/archive", () => {
  beforeEach(() => {
    archiveMock.mockReset();
    findItemMock.mockReset();
    requireAdminWorkspaceApiContextMock.mockReset();
    requireAdminWorkspaceApiContextMock.mockResolvedValue({ ok: true, ctx: adminWorkspace });
    withDoctorWorkspacePrincipalMock.mockClear();
    principalState.inside = false;
  });

  it("returns 403 for doctor", async () => {
    requireAdminWorkspaceApiContextMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false }), { status: 403 }),
    });
    const res = await PATCH(new Request("http://localhost/api/admin/references/x/archive"), {
      params: Promise.resolve({ itemId: "x" }),
    });
    expect(res.status).toBe(403);
  });

  it("archives for admin", async () => {
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
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      adminWorkspace,
      "admin.references.archive",
      expect.any(Function),
    );
  });

  it("keeps find precheck outside principal and archive inside principal", async () => {
    findItemMock.mockImplementation(async () => {
      expect(principalState.inside).toBe(false);
      return {
        id: "it1",
        categoryId: "c",
        code: "x",
        title: "T",
        sortOrder: 1,
        isActive: true,
        deletedAt: null,
        metaJson: {},
      };
    });
    archiveMock.mockImplementation(async () => {
      expect(principalState.inside).toBe(true);
    });

    const res = await PATCH(new Request("http://localhost/api/admin/references/it1/archive"), {
      params: Promise.resolve({ itemId: "it1" }),
    });

    expect(res.status).toBe(200);
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      adminWorkspace,
      "admin.references.archive",
      expect.any(Function),
    );
  });
});
