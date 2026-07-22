import { beforeEach, describe, expect, it, vi } from "vitest";

const resolvePublicBookingOrganizationMock = vi.hoisted(() => vi.fn());
const resolveCanonicalInPersonContextMock = vi.hoisted(() => vi.fn());
const getBranchMock = vi.hoisted(() => vi.fn());
const getServiceMock = vi.hoisted(() => vi.fn());
const getSlotsMock = vi.hoisted(() => vi.fn());
const resolveOrganizationIdBySlugMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    patientBooking: { getSlots: getSlotsMock },
    clinicDirectory: { resolveOrganizationIdBySlug: resolveOrganizationIdBySlugMock },
    bookingEngine: { catalog: { getBranch: getBranchMock }, services: { getService: getServiceMock } },
    bookingScheduling: {
      resolvePublicBookingOrganization: resolvePublicBookingOrganizationMock,
      resolveCanonicalInPersonContext: resolveCanonicalInPersonContextMock,
    },
  }),
}));

import { GET } from "./route";

const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BRANCH_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SERVICE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

describe("GET /api/booking/public/slots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolvePublicBookingOrganizationMock.mockResolvedValue(ORG_ID);
    resolveOrganizationIdBySlugMock.mockResolvedValue(ORG_ID);
    getBranchMock.mockResolvedValue({ id: BRANCH_ID, organizationId: ORG_ID });
    getServiceMock.mockResolvedValue({ id: SERVICE_ID, organizationId: ORG_ID });
    resolveCanonicalInPersonContextMock.mockResolvedValue({ organizationId: ORG_ID, branchId: BRANCH_ID, serviceId: SERVICE_ID });
    getSlotsMock.mockResolvedValue([{ date: "2026-07-17", slots: [] }]);
  });

  it("derives the tenant and passes only canonical keys", async () => {
    const response = await GET(new Request(`http://localhost/api/booking/public/slots?type=in_person&branchId=${BRANCH_ID}&serviceId=${SERVICE_ID}&orgSlug=clinic-a`));
    expect(response.status).toBe(200);
    expect(resolvePublicBookingOrganizationMock).toHaveBeenCalledWith({ branchId: BRANCH_ID, serviceId: SERVICE_ID });
    expect(getSlotsMock).toHaveBeenCalledWith(expect.objectContaining({ organizationId: ORG_ID, branchId: BRANCH_ID, serviceId: SERVICE_ID }));
  });

  it("rejects a legacy-id-only request before booking reads", async () => {
    const response = await GET(new Request("http://localhost/api/booking/public/slots?type=in_person&branchServiceId=dddddddd-dddd-4ddd-8ddd-dddddddddddd&orgSlug=clinic-a"));
    expect(response.status).toBe(400);
    expect(getSlotsMock).not.toHaveBeenCalled();
  });
});
