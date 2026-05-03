import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: vi.fn(),
}));

const listRecommendations = vi.fn(async () => []);
const listActiveItemsByCategoryCode = vi.fn(async () => {
  const { inMemoryReferencesPort } = await import("@/infra/repos/inMemoryReferences");
  const { RECOMMENDATION_TYPE_CATEGORY_CODE } = await import("@/modules/recommendations/recommendationDomain");
  return inMemoryReferencesPort.listActiveItemsByCategoryCode(RECOMMENDATION_TYPE_CATEGORY_CODE);
});

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    references: { listActiveItemsByCategoryCode },
    recommendations: { listRecommendations },
  }),
}));

import { getCurrentSession } from "@/modules/auth/service";
import { GET } from "./route";

describe("GET /api/doctor/recommendations", () => {
  beforeEach(() => {
    listRecommendations.mockClear();
    listActiveItemsByCategoryCode.mockClear();
    vi.mocked(getCurrentSession).mockReset();
  });

  it("returns 400 invalid_query with field region when region is not a UUID", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue({
      user: { userId: "d1", role: "doctor", bindings: {} },
    } as never);
    const res = await GET(new Request("http://localhost/api/doctor/recommendations?region=not-a-uuid"));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error: string; field?: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("invalid_query");
    expect(body.field).toBe("region");
    expect(listRecommendations).not.toHaveBeenCalled();
  });

  it("returns 400 invalid_query with field domain when domain is not in catalog", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue({
      user: { userId: "d1", role: "doctor", bindings: {} },
    } as never);
    const res = await GET(new Request("http://localhost/api/doctor/recommendations?domain=__not_in_catalog__"));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; field?: string };
    expect(body.field).toBe("domain");
    expect(listRecommendations).not.toHaveBeenCalled();
  });

  it("lists when query is valid", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue({
      user: { userId: "d1", role: "doctor", bindings: {} },
    } as never);
    listRecommendations.mockResolvedValueOnce([]);
    const region = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const res = await GET(
      new Request(`http://localhost/api/doctor/recommendations?region=${region}&domain=nutrition`),
    );
    expect(res.status).toBe(200);
    expect(listRecommendations).toHaveBeenCalledWith({
      search: null,
      includeArchived: false,
      regionRefId: region,
      domain: "nutrition",
    });
  });
});
