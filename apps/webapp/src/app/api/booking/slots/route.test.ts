import { describe, expect, it, vi } from "vitest";

const getCurrentSessionMock = vi.hoisted(() => vi.fn());
const getSlotsMock = vi.hoisted(() => vi.fn());
const resolveCanonicalInPersonContextMock = vi.hoisted(() => vi.fn());
const getBranchMock = vi.hoisted(() => vi.fn());
const getServiceMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/auth/service", () => ({ getCurrentSession: getCurrentSessionMock }));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    patientBooking: { getSlots: getSlotsMock },
    bookingEngine: { catalog: { getBranch: getBranchMock }, services: { getService: getServiceMock } },
    bookingScheduling: { resolveCanonicalInPersonContext: resolveCanonicalInPersonContextMock },
  }),
}));

import { GET } from "./route";

const BRANCH_ID = "550e8400-e29b-41d4-a716-446655440001";
const SERVICE_ID = "550e8400-e29b-41d4-a716-446655440002";
const ORG_ID = "22222222-2222-4222-8222-222222222222";
const session = { user: { userId: "u1", role: "client" as const, phone: "+79990001122" } };

describe("GET /api/booking/slots", () => {
  it("uses canonical branchId+serviceId", async () => {
    getCurrentSessionMock.mockResolvedValue(session);
    getBranchMock.mockResolvedValue({ id: BRANCH_ID, organizationId: ORG_ID, cityCode: "moscow" });
    getServiceMock.mockResolvedValue({ id: SERVICE_ID, organizationId: ORG_ID });
    resolveCanonicalInPersonContextMock.mockResolvedValue({ organizationId: ORG_ID, branchId: BRANCH_ID, serviceId: SERVICE_ID });
    getSlotsMock.mockResolvedValue([{ date: "2026-04-01", slots: [] }]);

    const response = await GET(new Request(`http://localhost/api/booking/slots?type=in_person&branchId=${BRANCH_ID}&serviceId=${SERVICE_ID}`));

    expect(response.status).toBe(200);
    expect(resolveCanonicalInPersonContextMock).toHaveBeenCalledWith({ organizationId: ORG_ID, branchId: BRANCH_ID, serviceId: SERVICE_ID });
    expect(getSlotsMock).toHaveBeenCalledWith(expect.objectContaining({ type: "in_person", branchId: BRANCH_ID, serviceId: SERVICE_ID }));
  });

  it("rejects the retired branchServiceId-only request", async () => {
    getCurrentSessionMock.mockResolvedValue(session);
    const response = await GET(new Request("http://localhost/api/booking/slots?type=in_person&branchServiceId=11111111-1111-4111-8111-111111111111"));
    expect(response.status).toBe(400);
    expect(getSlotsMock).not.toHaveBeenCalled();
  });
});
