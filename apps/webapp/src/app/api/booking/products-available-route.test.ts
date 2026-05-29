import { describe, expect, it, vi } from "vitest";

const listActivePurchasesForBookingMock = vi.hoisted(() => vi.fn());
const resolveInPersonContextMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    products: { listActivePurchasesForBooking: listActivePurchasesForBookingMock },
    bookingEngine: { organization: { getDefaultOrganizationId: async () => "org-1" } },
    bookingScheduling: { resolveInPersonContext: resolveInPersonContextMock },
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
});
