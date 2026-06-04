import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminBookingEngineMock = vi.hoisted(() => vi.fn());
const listSsaDuplicatesMock = vi.hoisted(() => vi.fn());
const resolveSsaDuplicateMock = vi.hoisted(() => vi.fn());

vi.mock("../../_requireAdminBookingEngine", () => ({
  requireAdminBookingEngine: requireAdminBookingEngineMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    rubitimeMapping: {
      listSsaDuplicates: listSsaDuplicatesMock,
      resolveSsaDuplicate: resolveSsaDuplicateMock,
    },
  }),
}));

import { GET, POST } from "./route";

describe("rubitime-mapping duplicates route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: { organizationId: "org-1" },
    });
    listSsaDuplicatesMock.mockResolvedValue({
      totalGroups: 1,
      groups: [
        {
          branchId: "550e8400-e29b-41d4-a716-446655440001",
          branchTitle: "Москва",
          serviceId: "550e8400-e29b-41d4-a716-446655440002",
          serviceTitle: "Сеанс 60",
          specialistId: "550e8400-e29b-41d4-a716-446655440003",
          specialistName: "Дмитрий Берсон",
          recommendedKeepSsaId: "550e8400-e29b-41d4-a716-446655440004",
          rows: [],
        },
      ],
    });
    resolveSsaDuplicateMock.mockResolvedValue({
      branchId: "550e8400-e29b-41d4-a716-446655440001",
      serviceId: "550e8400-e29b-41d4-a716-446655440002",
      specialistId: "550e8400-e29b-41d4-a716-446655440003",
      keepSsaId: "550e8400-e29b-41d4-a716-446655440004",
      deactivatedIds: ["550e8400-e29b-41d4-a716-446655440005"],
      transferredMapping: true,
    });
  });

  it("returns duplicates summary", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok?: boolean; totalGroups?: number };
    expect(json.ok).toBe(true);
    expect(json.totalGroups).toBe(1);
    expect(listSsaDuplicatesMock).toHaveBeenCalledWith({ organizationId: "org-1" });
  });

  it("resolves duplicate scope", async () => {
    const res = await POST(
      new Request("http://localhost/api/admin/booking-engine/rubitime-mapping/duplicates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId: "550e8400-e29b-41d4-a716-446655440001",
          serviceId: "550e8400-e29b-41d4-a716-446655440002",
          specialistId: "550e8400-e29b-41d4-a716-446655440003",
          keepSsaId: "550e8400-e29b-41d4-a716-446655440004",
          transferMappingToKeep: true,
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(resolveSsaDuplicateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        transferMappingToKeep: true,
      }),
    );
  });

  it("returns 400 for invalid body", async () => {
    const res = await POST(
      new Request("http://localhost/api/admin/booking-engine/rubitime-mapping/duplicates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keepSsaId: "x" }),
      }),
    );
    expect(res.status).toBe(400);
  });
});
