import { describe, expect, it, vi } from "vitest";

const listActivePurchasesForBookingMock = vi.hoisted(() => vi.fn());
const resolveCanonicalInPersonContextMock = vi.hoisted(() => vi.fn());
const ORG_ID = "11111111-1111-4111-8111-111111111111";

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    products: { listActivePurchasesForBooking: listActivePurchasesForBookingMock },
    bookingEngine: {
      organization: { getDefaultOrganizationId: async () => ORG_ID },
      catalog: {
        getBranch: async () => ({ organizationId: ORG_ID }),
        listSpecialists: async () => [{ id: "sp-1", isActive: true }],
      },
      services: { getService: async () => ({ organizationId: ORG_ID }) },
    },
    bookingScheduling: {
      resolveCanonicalInPersonContext: resolveCanonicalInPersonContextMock,
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
  it("resolves serviceId from branchId+serviceId", async () => {
    resolveCanonicalInPersonContextMock.mockResolvedValue({
      organizationId: ORG_ID,
      branchId: "550e8400-e29b-41d4-a716-446655440001",
      serviceId: "svc-1",
    });
    listActivePurchasesForBookingMock.mockResolvedValue([{ id: "pur-1", title: "T", visitsRemaining: 1 }]);
    const res = await GET(
      new Request(
        "http://localhost/api/booking/products/available?branchId=550e8400-e29b-41d4-a716-446655440001&serviceId=svc-1",
      ),
    );
    const json = (await res.json()) as { ok?: boolean; purchases?: unknown[] };
    expect(json.ok).toBe(true);
    expect(listActivePurchasesForBookingMock).toHaveBeenCalledWith("u1", ORG_ID, "svc-1");
  });

  it("returns 404 when canonical pair is unmapped", async () => {
    resolveCanonicalInPersonContextMock.mockResolvedValue(null);
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
