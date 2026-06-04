import { describe, expect, it, vi } from "vitest";

const getCurrentSessionMock = vi.hoisted(() => vi.fn());
const getSlotsMock = vi.hoisted(() => vi.fn());
const resolveLegacyBranchServiceIdMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: getCurrentSessionMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    patientBooking: { getSlots: getSlotsMock },
    bookingEngine: {
      organization: { getDefaultOrganizationId: async () => "org-1" },
      catalog: { listSpecialists: async () => [{ id: "sp-1", isActive: true }] },
    },
    bookingScheduling: {
      resolveLegacyBranchServiceId: resolveLegacyBranchServiceIdMock,
    },
  }),
}));

import { GET } from "./route";

const patientClientSession = { user: { userId: "u1", role: "client" as const, phone: "+79990001122" } };

describe("GET /api/booking/slots", () => {
  it("returns 401 for unauthenticated request", async () => {
    getCurrentSessionMock.mockResolvedValue(null);
    const response = await GET(new Request("http://localhost/api/booking/slots?type=online&category=general"));
    expect(response.status).toBe(401);
  });

  it("returns slots for valid query", async () => {
    getCurrentSessionMock.mockResolvedValue(patientClientSession);
    getSlotsMock.mockResolvedValue([{ date: "2026-04-01", slots: [{ startAt: "2026-04-01T10:00:00+03:00", endAt: "2026-04-01T11:00:00+03:00" }] }]);
    const response = await GET(new Request("http://localhost/api/booking/slots?type=online&category=general"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, slots: expect.any(Array) });
  });

  it("returns 404 when branch_service_not_found for in_person", async () => {
    getCurrentSessionMock.mockResolvedValue(patientClientSession);
    getSlotsMock.mockRejectedValue(new Error("branch_service_not_found"));
    const response = await GET(
      new Request(
        "http://localhost/api/booking/slots?type=in_person&branchServiceId=11111111-1111-4111-8111-111111111111",
      ),
    );
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("branch_service_not_found");
  });

  it("resolves canonical branchId+serviceId before getSlots", async () => {
    getCurrentSessionMock.mockResolvedValue(patientClientSession);
    resolveLegacyBranchServiceIdMock.mockResolvedValue("bs-canonical");
    getSlotsMock.mockResolvedValue([{ date: "2026-04-01", slots: [] }]);
    const branchId = "550e8400-e29b-41d4-a716-446655440001";
    const serviceId = "550e8400-e29b-41d4-a716-446655440002";
    const response = await GET(
      new Request(
        `http://localhost/api/booking/slots?type=in_person&branchId=${branchId}&serviceId=${serviceId}`,
      ),
    );
    expect(response.status).toBe(200);
    expect(resolveLegacyBranchServiceIdMock).toHaveBeenCalled();
    expect(getSlotsMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: "in_person", branchServiceId: "bs-canonical" }),
    );
  });

  it("returns 404 when canonical mapping missing", async () => {
    getCurrentSessionMock.mockResolvedValue(patientClientSession);
    resolveLegacyBranchServiceIdMock.mockResolvedValue(null);
    const response = await GET(
      new Request(
        "http://localhost/api/booking/slots?type=in_person&branchId=550e8400-e29b-41d4-a716-446655440001&serviceId=550e8400-e29b-41d4-a716-446655440002",
      ),
    );
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("branch_service_mapping_missing");
  });
});
