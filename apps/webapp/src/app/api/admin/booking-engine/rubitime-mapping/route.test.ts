import { describe, expect, it, vi, beforeEach } from "vitest";

const requireAdminBookingEngineMock = vi.hoisted(() => vi.fn());
const listMappingsMock = vi.hoisted(() => vi.fn());

vi.mock("../_requireAdminBookingEngine", () => ({
  requireAdminBookingEngine: requireAdminBookingEngineMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    rubitimeMapping: {
      listMappings: listMappingsMock,
    },
  }),
}));

import { GET } from "./route";

describe("GET /api/admin/booking-engine/rubitime-mapping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: { organizationId: "org-1" },
    });
    listMappingsMock.mockResolvedValue({
      total: 1,
      mappedOk: 0,
      problems: 1,
      rows: [
        {
          branchId: "b1",
          branchTitle: "Москва",
          serviceId: "s1",
          serviceTitle: "60 мин",
          rubitimeBranchTitle: null,
          rubitimeSpecialistName: null,
          rubitimeServiceTitle: null,
          status: "unmapped",
          issues: [],
          branchServiceId: null,
        },
      ],
    });
  });

  it("returns mapping summary", async () => {
    const res = await GET(new Request("http://localhost/api/admin/booking-engine/rubitime-mapping?problemsOnly=true"));
    const json = (await res.json()) as { ok?: boolean; total?: number; rows?: unknown[] };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.total).toBe(1);
    expect(listMappingsMock).toHaveBeenCalledWith({
      organizationId: "org-1",
      problemsOnly: true,
      branchId: undefined,
      serviceId: undefined,
    });
  });

  it("returns 401 when admin gate fails", async () => {
    requireAdminBookingEngineMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: "unauthorized" }), { status: 401 }),
    });
    const res = await GET(new Request("http://localhost/api/admin/booking-engine/rubitime-mapping"));
    expect(res.status).toBe(401);
  });
});
