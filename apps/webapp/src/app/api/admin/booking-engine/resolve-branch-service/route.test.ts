import { describe, expect, it, vi, beforeEach } from "vitest";

const requireAdminBookingEngineMock = vi.hoisted(() => vi.fn());
const resolveLegacyBranchServiceIdMock = vi.hoisted(() => vi.fn());
const getBranchMock = vi.hoisted(() => vi.fn());
const listSpecialistsMock = vi.hoisted(() => vi.fn());

vi.mock("../_requireAdminBookingEngine", () => ({
  requireAdminBookingEngine: requireAdminBookingEngineMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    bookingScheduling: {
      resolveLegacyBranchServiceId: resolveLegacyBranchServiceIdMock,
    },
  }),
}));

import { GET } from "./route";

describe("/api/admin/booking-engine/resolve-branch-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: "org-1",
        service: {
          catalog: {
            getBranch: getBranchMock,
            listSpecialists: listSpecialistsMock,
          },
        },
      },
    });
    getBranchMock.mockResolvedValue({
      id: "branch-1",
      organizationId: "org-1",
      cityCode: "msk",
      timezone: "Europe/Moscow",
    });
    listSpecialistsMock.mockResolvedValue([{ id: "spec-1", isActive: true }]);
    resolveLegacyBranchServiceIdMock.mockResolvedValue("legacy-bs-1");
  });

  it("returns branchServiceId and cityCode", async () => {
    const res = await GET(
      new Request(
        "http://localhost/api/admin/booking-engine/resolve-branch-service?branchId=550e8400-e29b-41d4-a716-446655440001&serviceId=550e8400-e29b-41d4-a716-446655440002",
      ),
    );
    const json = (await res.json()) as { ok?: boolean; branchServiceId?: string; cityCode?: string };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.branchServiceId).toBe("legacy-bs-1");
    expect(json.cityCode).toBe("msk");
  });

  it("returns 404 when mapping missing", async () => {
    resolveLegacyBranchServiceIdMock.mockResolvedValueOnce(null);
    const res = await GET(
      new Request(
        "http://localhost/api/admin/booking-engine/resolve-branch-service?branchId=550e8400-e29b-41d4-a716-446655440001&serviceId=550e8400-e29b-41d4-a716-446655440002",
      ),
    );
    expect(res.status).toBe(404);
  });
});
