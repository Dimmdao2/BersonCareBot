import { beforeEach, describe, expect, it, vi } from "vitest";

const { insertMock, findCatMock, buildAppDepsMock, getSessionMock } = vi.hoisted(() => {
  const insertMockInner = vi.fn();
  const findCatMockInner = vi.fn();
  const getSessionMockInner = vi.fn();
  return {
    insertMock: insertMockInner,
    findCatMock: findCatMockInner,
    getSessionMock: getSessionMockInner,
    buildAppDepsMock: vi.fn(() => ({
      references: {
        insertItem: insertMockInner,
        findCategoryByCode: findCatMockInner,
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

import { POST } from "./route";

describe("POST /api/doctor/references/[categoryCode]", () => {
  beforeEach(() => {
    insertMock.mockClear();
  });

  it("returns 401 without session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await POST(
      new Request("http://localhost/api/doctor/references/symptom_type", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "X" }),
      }),
      { params: Promise.resolve({ categoryCode: "symptom_type" }) }
    );
    expect(res.status).toBe(401);
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
});
