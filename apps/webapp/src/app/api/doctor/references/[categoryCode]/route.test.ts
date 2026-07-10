import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  insertMock,
  findCatMock,
  listMock,
  buildAppDepsMock,
  getSessionMock,
  requireDoctorWorkspaceApiContextMock,
  withDoctorWorkspacePrincipalMock,
} = vi.hoisted(() => {
  const insertMockInner = vi.fn();
  const findCatMockInner = vi.fn();
  const listMockInner = vi.fn();
  const getSessionMockInner = vi.fn();
  const requireDoctorWorkspaceApiContextMockInner = vi.fn();
  const withDoctorWorkspacePrincipalMockInner = vi.fn((_: unknown, sourceOrFn: string | (() => unknown), maybeFn?: () => unknown) => {
  const fn = typeof sourceOrFn === "function" ? sourceOrFn : maybeFn;
  if (!fn) throw new Error("principal_callback_required");
  return fn();
});
  return {
    insertMock: insertMockInner,
    findCatMock: findCatMockInner,
    listMock: listMockInner,
    getSessionMock: getSessionMockInner,
    requireDoctorWorkspaceApiContextMock: requireDoctorWorkspaceApiContextMockInner,
    withDoctorWorkspacePrincipalMock: withDoctorWorkspacePrincipalMockInner,
    buildAppDepsMock: vi.fn(() => ({
      references: {
        insertItem: insertMockInner,
        findCategoryByCode: findCatMockInner,
        listActiveItemsByCategoryCode: listMockInner,
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
vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorWorkspaceApiContext: requireDoctorWorkspaceApiContextMock,
}));
vi.mock("@/app-layer/guards/doctorWorkspacePrincipal", () => ({
  withDoctorWorkspacePrincipal: (
    ctx: unknown,
    sourceOrFn: string | (() => unknown),
    maybeFn?: () => unknown,
  ) => {
    const fn = typeof sourceOrFn === "function" ? sourceOrFn : maybeFn;
    if (!fn) throw new Error("principal_callback_required");
    return withDoctorWorkspacePrincipalMock(ctx, fn);
  },
}));

import { GET, POST } from "./route";

describe("/api/doctor/references/[categoryCode]", () => {
  beforeEach(() => {
    insertMock.mockReset();
    findCatMock.mockReset();
    listMock.mockReset();
    getSessionMock.mockReset();
    requireDoctorWorkspaceApiContextMock.mockReset();
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: true,
      ctx: { organizationId: "org-1", session: { user: { userId: "d1", role: "doctor" } } },
    });
    withDoctorWorkspacePrincipalMock.mockClear();
    withDoctorWorkspacePrincipalMock.mockImplementation(
      (_: unknown, sourceOrFn: string | (() => unknown), maybeFn?: () => unknown) => {
        const fn = typeof sourceOrFn === "function" ? sourceOrFn : maybeFn;
        if (!fn) throw new Error("principal_callback_required");
        return fn();
      },
    );
  });

  it("GET returns 401 without session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await GET(
      new Request("http://localhost/api/doctor/references/visit_manipulation"),
      { params: Promise.resolve({ categoryCode: "visit_manipulation" }) },
    );
    expect(res.status).toBe(401);
  });

  it("GET returns 403 for non-doctor session", async () => {
    getSessionMock.mockResolvedValue({
      user: { userId: "p1", role: "client", displayName: "P", bindings: {} },
    });
    const res = await GET(
      new Request("http://localhost/api/doctor/references/visit_manipulation"),
      { params: Promise.resolve({ categoryCode: "visit_manipulation" }) },
    );
    expect(res.status).toBe(403);
    expect(findCatMock).not.toHaveBeenCalled();
    expect(listMock).not.toHaveBeenCalled();
  });

  it("GET returns doctor-only reference items for doctor", async () => {
    getSessionMock.mockResolvedValue({
      user: { userId: "d1", role: "doctor", displayName: "D", bindings: {} },
    });
    findCatMock.mockResolvedValue({
      id: "c3",
      code: "visit_manipulation",
      title: "Манипуляции визита",
      isUserExtensible: true,
      tenantId: null,
    });
    listMock.mockResolvedValue([
      {
        id: "i1",
        categoryId: "c3",
        code: "mobilization",
        title: "Мобилизация",
        sortOrder: 10,
        isActive: true,
        deletedAt: null,
        metaJson: {},
      },
    ]);
    const res = await GET(
      new Request("http://localhost/api/doctor/references/visit_manipulation"),
      { params: Promise.resolve({ categoryCode: "visit_manipulation" }) },
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; items: { title: string }[] };
    expect(data.ok).toBe(true);
    expect(data.items[0]?.title).toBe("Мобилизация");
  });

  it("returns 401 without session", async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValueOnce({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: "unauthorized" }), { status: 401 }),
    });
    const res = await POST(
      new Request("http://localhost/api/doctor/references/symptom_type", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "X" }),
      }),
      { params: Promise.resolve({ categoryCode: "symptom_type" }) },
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-doctor session", async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValueOnce({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: "forbidden" }), { status: 403 }),
    });
    const res = await POST(
      new Request("http://localhost/api/doctor/references/symptom_type", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "X" }),
      }),
      { params: Promise.resolve({ categoryCode: "symptom_type" }) },
    );
    expect(res.status).toBe(403);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("returns 200 for doctor and inserts", async () => {
    getSessionMock.mockResolvedValue({
      user: { userId: "d1", role: "doctor", displayName: "D", bindings: {} },
    });
    findCatMock.mockResolvedValue({
      id: "c1",
      code: "symptom_type",
      title: "T",
      isUserExtensible: true,
      tenantId: null,
    });
    insertMock.mockResolvedValue({
      id: "i1",
      code: "doc_x",
      title: "Новое",
      categoryId: "c1",
      sortOrder: 999,
      isActive: true,
      deletedAt: null,
      metaJson: {},
    });
    const res = await POST(
      new Request("http://localhost/api/doctor/references/symptom_type", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Новое" }),
      }),
      { params: Promise.resolve({ categoryCode: "symptom_type" }) }
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean };
    expect(data.ok).toBe(true);
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1" }),
      expect.any(Function),
    );
  });

  it("returns 403 when category is not user-extensible", async () => {
    getSessionMock.mockResolvedValue({
      user: { userId: "d1", role: "doctor", displayName: "D", bindings: {} },
    });
    findCatMock.mockResolvedValue({
      id: "c2",
      code: "body_region",
      title: "Регион",
      isUserExtensible: false,
      tenantId: null,
    });
    const res = await POST(
      new Request("http://localhost/api/doctor/references/body_region", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Новый регион" }),
      }),
      { params: Promise.resolve({ categoryCode: "body_region" }) }
    );
    expect(res.status).toBe(403);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("rejects whitespace-only titles", async () => {
    getSessionMock.mockResolvedValue({
      user: { userId: "d1", role: "doctor", displayName: "D", bindings: {} },
    });
    const res = await POST(
      new Request("http://localhost/api/doctor/references/symptom_type", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "   " }),
      }),
      { params: Promise.resolve({ categoryCode: "symptom_type" }) }
    );
    expect(res.status).toBe(400);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("trims titles before insert", async () => {
    getSessionMock.mockResolvedValue({
      user: { userId: "d1", role: "doctor", displayName: "D", bindings: {} },
    });
    findCatMock.mockResolvedValue({
      id: "c3",
      code: "visit_manipulation",
      title: "Манипуляции визита",
      isUserExtensible: true,
      tenantId: null,
    });
    insertMock.mockResolvedValueOnce({
      id: "i1",
      categoryCode: "visit_manipulation",
      code: "doctor_abc",
      title: "Новая манипуляция",
      sortOrder: 0,
      isActive: true,
    });
    const res = await POST(
      new Request("http://localhost/api/doctor/references/visit_manipulation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "  Новая манипуляция  " }),
      }),
      { params: Promise.resolve({ categoryCode: "visit_manipulation" }) },
    );
    expect(res.status).toBe(200);
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Новая манипуляция",
      }),
    );
  });
});
