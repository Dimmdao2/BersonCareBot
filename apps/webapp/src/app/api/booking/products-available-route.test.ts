import { describe, expect, it, vi } from "vitest";

const listActivePurchasesForBookingMock = vi.hoisted(() => vi.fn());
const resolveInPersonContextMock = vi.hoisted(() => vi.fn());
const resolveLegacyBranchServiceIdMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    products: { listActivePurchasesForBooking: listActivePurchasesForBookingMock },
    bookingEngine: {
      organization: { getDefaultOrganizationId: async () => "org-1" },
      catalog: { listSpecialists: async () => [{ id: "sp-1", isActive: true }] },
    },
    bookingScheduling: {
      resolveInPersonContext: resolveInPersonContextMock,
      resolveLegacyBranchServiceId: resolveLegacyBranchServiceIdMock,
    },
  }),
}));

vi.mock("@/app-layer/guards/requireRole", () => ({
  requirePatientApiBusinessAccess: async () => ({
    ok: true,
    session: { user: { userId: "u1", role: "client" } },
  }),
}));

import { GET } from "./products/available/route";

describe("GET /api/booking/products/available", () => {
  it("resolves serviceId from branchServiceId", async () => {
    resolveInPersonContextMock.mockResolvedValue({ serviceId: "svc-1" });
    listActivePurchasesForBookingMock.mockResolvedValue([{ id: "pur-1", title: "T", visitsRemaining: 1 }]);
    const res = await GET(
      new Request("http://localhost/api/booking/products/available?branchServiceId=bs-1"),
    );
    const json = (await res.json()) as { ok?: boolean; purchases?: unknown[] };
    expect(json.ok).toBe(true);
    expect(listActivePurchasesForBookingMock).toHaveBeenCalledWith("u1", "org-1", "svc-1");
  });

  it("returns 404 when canonical pair is unmapped", async () => {
    resolveLegacyBranchServiceIdMock.mockResolvedValue(null);
    const res = await GET(
      new Request(
        "http://localhost/api/booking/products/available?branchId=550e8400-e29b-41d4-a716-446655440001&serviceId=550e8400-e29b-41d4-a716-446655440002",
      ),
    );
    expect(res.status).toBe(404);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toBe("branch_service_mapping_missing");
  });
});
