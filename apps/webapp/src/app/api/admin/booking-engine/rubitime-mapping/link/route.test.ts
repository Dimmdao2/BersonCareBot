import { describe, expect, it, vi, beforeEach } from "vitest";

const requireAdminBookingEngineMock = vi.hoisted(() => vi.fn());
const linkMappingMock = vi.hoisted(() => vi.fn());
const resolveInPersonContextMock = vi.hoisted(() => vi.fn());
const resolveLegacyBranchServiceIdMock = vi.hoisted(() => vi.fn());
const listSpecialistsMock = vi.hoisted(() => vi.fn());

vi.mock("../../_requireAdminBookingEngine", () => ({
  requireAdminBookingEngine: requireAdminBookingEngineMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    rubitimeMapping: { linkMapping: linkMappingMock },
    bookingScheduling: {
      resolveInPersonContext: resolveInPersonContextMock,
      resolveLegacyBranchServiceId: resolveLegacyBranchServiceIdMock,
    },
  }),
}));

import { POST } from "./route";

describe("POST /api/admin/booking-engine/rubitime-mapping/link", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: "org-1",
        service: { catalog: { listSpecialists: listSpecialistsMock } },
      },
    });
    listSpecialistsMock.mockResolvedValue([{ id: "spec-1", isActive: true }]);
    linkMappingMock.mockResolvedValue({ branchServiceId: "bs-1", ssaId: "ssa-1" });
    resolveLegacyBranchServiceIdMock.mockResolvedValue("bs-1");
    resolveInPersonContextMock.mockResolvedValue({
      branchId: "b1",
      serviceId: "s1",
      branchServiceId: "bs-1",
    });
  });

  it("links mapping and verifies reverse resolve", async () => {
    const res = await POST(
      new Request("http://localhost/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId: "550e8400-e29b-41d4-a716-446655440001",
          serviceId: "550e8400-e29b-41d4-a716-446655440002",
          legacyBranchId: "550e8400-e29b-41d4-a716-446655440003",
          legacyServiceId: "550e8400-e29b-41d4-a716-446655440004",
          legacySpecialistId: "550e8400-e29b-41d4-a716-446655440005",
          rubitimeServiceId: "rt-svc-1",
        }),
      }),
    );
    const json = (await res.json()) as { ok?: boolean; branchServiceId?: string };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.branchServiceId).toBe("bs-1");
    expect(linkMappingMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        specialistId: "spec-1",
        rubitimeServiceId: "rt-svc-1",
      }),
    );
    expect(resolveLegacyBranchServiceIdMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        branchId: "550e8400-e29b-41d4-a716-446655440001",
        serviceId: "550e8400-e29b-41d4-a716-446655440002",
        specialistId: "spec-1",
      }),
    );
    expect(resolveInPersonContextMock).toHaveBeenCalledWith("bs-1");
  });

  it("returns 500 when reverse resolve does not match link result", async () => {
    resolveLegacyBranchServiceIdMock.mockResolvedValue("bs-other");
    const res = await POST(
      new Request("http://localhost/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId: "550e8400-e29b-41d4-a716-446655440001",
          serviceId: "550e8400-e29b-41d4-a716-446655440002",
          legacyBranchId: "550e8400-e29b-41d4-a716-446655440003",
          legacyServiceId: "550e8400-e29b-41d4-a716-446655440004",
          legacySpecialistId: "550e8400-e29b-41d4-a716-446655440005",
          rubitimeServiceId: "rt-svc-1",
        }),
      }),
    );
    expect(res.status).toBe(500);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toBe("link_verify_failed");
  });

  it("returns 400 on invalid body", async () => {
    const res = await POST(
      new Request("http://localhost/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branchId: "not-uuid" }),
      }),
    );
    expect(res.status).toBe(400);
  });
});
