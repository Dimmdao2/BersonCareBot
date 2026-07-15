import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentDbPrincipalOrganizationId } from "@bersoncare/db-principal";

const {
  resolvePublicBookingOrganizationMock,
  resolveLegacyBranchServiceIdMock,
  getBranchMock,
  getServiceMock,
  listSpecialistsMock,
  getSlotsMock,
} = vi.hoisted(() => ({
  resolvePublicBookingOrganizationMock: vi.fn(),
  resolveLegacyBranchServiceIdMock: vi.fn(),
  getBranchMock: vi.fn(),
  getServiceMock: vi.fn(),
  listSpecialistsMock: vi.fn(),
  getSlotsMock: vi.fn(),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    patientBooking: { getSlots: getSlotsMock },
    bookingEngine: {
      catalog: { getBranch: getBranchMock, listSpecialists: listSpecialistsMock },
      services: { getService: getServiceMock },
    },
    bookingScheduling: {
      resolvePublicBookingOrganization: resolvePublicBookingOrganizationMock,
      resolveLegacyBranchServiceId: resolveLegacyBranchServiceIdMock,
      resolveInPersonContext: vi.fn(),
    },
  }),
}));

import { GET } from "./route";

const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BRANCH_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SERVICE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
let organizationSeenByTenantRead: string | undefined;

describe("GET /api/booking/public/slots locked tenant bootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    organizationSeenByTenantRead = undefined;
    resolvePublicBookingOrganizationMock.mockResolvedValue(ORG_ID);
    getBranchMock.mockImplementation(async () => {
      organizationSeenByTenantRead = getCurrentDbPrincipalOrganizationId();
      return { id: BRANCH_ID, organizationId: ORG_ID };
    });
    getServiceMock.mockResolvedValue({ id: SERVICE_ID, organizationId: ORG_ID });
    listSpecialistsMock.mockResolvedValue([{ id: "specialist-1", isActive: true }]);
    resolveLegacyBranchServiceIdMock.mockResolvedValue("dddddddd-dddd-4ddd-8ddd-dddddddddddd");
    getSlotsMock.mockResolvedValue([{ date: "2026-07-17", slots: [] }]);
  });

  it("derives org first, then performs tenant reads under that explicit org", async () => {
    const response = await GET(
      new Request(
        `http://localhost/api/booking/public/slots?type=in_person&branchId=${BRANCH_ID}&serviceId=${SERVICE_ID}`,
      ),
    );

    expect(response.status).toBe(200);
    expect(resolvePublicBookingOrganizationMock).toHaveBeenCalledWith({
      branchId: BRANCH_ID,
      serviceId: SERVICE_ID,
    });
    expect(resolvePublicBookingOrganizationMock.mock.invocationCallOrder[0]).toBeLessThan(
      getBranchMock.mock.invocationCallOrder[0]!,
    );
    expect(organizationSeenByTenantRead).toBe(ORG_ID);
    expect(getSlotsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_ID,
        branchServiceId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      }),
    );
  });

  it("fails closed before tenant reads when no unique organization can be proved", async () => {
    resolvePublicBookingOrganizationMock.mockResolvedValue(null);
    const response = await GET(
      new Request(
        `http://localhost/api/booking/public/slots?type=in_person&branchId=${BRANCH_ID}&serviceId=${SERVICE_ID}`,
      ),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, error: "ambiguous_booking_tenant" });
    expect(getBranchMock).not.toHaveBeenCalled();
    expect(getServiceMock).not.toHaveBeenCalled();
    expect(getSlotsMock).not.toHaveBeenCalled();
  });
});
