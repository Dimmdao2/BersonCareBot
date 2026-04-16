import { describe, expect, it, vi } from "vitest";

const { listMock, findCatMock, buildAppDepsMock } = vi.hoisted(() => {
  const listMockInner = vi.fn();
  const findCatMockInner = vi.fn();
  return {
    listMock: listMockInner,
    findCatMock: findCatMockInner,
    buildAppDepsMock: vi.fn(() => ({
      references: {
        findCategoryByCode: findCatMockInner,
        listActiveItemsByCategoryCode: listMockInner,
      },
    })),
  };
});

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: buildAppDepsMock,
}));

import { GET } from "./route";

describe("GET /api/references/[categoryCode]", () => {
  it("returns items", async () => {
    findCatMock.mockResolvedValue({
      id: "c",
      code: "symptom_type",
      title: "T",
      isUserExtensible: true,
      tenantId: null,
    });
    listMock.mockResolvedValue([
      { id: "1", code: "a", title: "A", sortOrder: 1, categoryId: "c", isActive: true, deletedAt: null, metaJson: {} },
    ]);
    const res = await GET(new Request("http://localhost/api/references/symptom_type"), {
      params: Promise.resolve({ categoryCode: "symptom_type" }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; items: { id: string }[] };
    expect(data.ok).toBe(true);
    expect(data.items[0]?.id).toBe("1");
  });

  it("returns 400 when category empty", async () => {
    const res = await GET(new Request("http://localhost/api/references/"), {
      params: Promise.resolve({ categoryCode: "" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when category unknown", async () => {
    findCatMock.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/references/unknown_cat"), {
      params: Promise.resolve({ categoryCode: "unknown_cat" }),
    });
    expect(res.status).toBe(404);
    const data = (await res.json()) as { error?: string };
    expect(data.error).toBe("category_not_found");
  });
});
