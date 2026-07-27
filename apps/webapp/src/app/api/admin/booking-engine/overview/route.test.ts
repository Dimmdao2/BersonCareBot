import { describe, expect, it, vi } from "vitest";

const requireClinicManagementBookingEngineMock = vi.hoisted(() => vi.fn());
const getPublishedSlugForOrganizationMock = vi.hoisted(() => vi.fn());

vi.mock("../_requireAdminBookingEngine", () => ({
  requireClinicManagementBookingEngine: requireClinicManagementBookingEngineMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    clinicDirectory: { getPublishedSlugForOrganization: getPublishedSlugForOrganizationMock },
  }),
}));

import { GET } from "./route";

describe("GET /api/admin/booking-engine/overview", () => {
  it("returns canonical booking read sources", async () => {
    getPublishedSlugForOrganizationMock.mockResolvedValue("clinic-a");
    const bridge = {
      getMappingSummary: vi.fn().mockResolvedValue({
        branches: 1,
        specialists: 1,
        services: 1,
        availabilities: 0,
        appointments: 0,
      }),
      isBridgeEnabled: vi.fn().mockResolvedValue(true),
    };
    requireClinicManagementBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: "org-1",
        service: {
          organization: { getOrganization: vi.fn().mockResolvedValue({ id: "org-1" }) },
          catalog: {
            listBranches: vi.fn().mockResolvedValue([]),
            listRooms: vi.fn().mockResolvedValue([]),
            listSpecialists: vi.fn().mockResolvedValue([]),
            listSpecialistRooms: vi.fn().mockResolvedValue([]),
          },
          services: {
            listServices: vi.fn().mockResolvedValue([]),
            listSpecialistServiceAvailability: vi.fn().mockResolvedValue([]),
            listServiceLocationAvailability: vi.fn().mockResolvedValue([]),
          },
          bridge,
        },
      },
    });
    const res = await GET();
    const json = (await res.json()) as {
      ok?: boolean;
      publicWidget?: { publicSlug?: string | null };
    };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.publicWidget).toEqual({ publicSlug: "clinic-a", specialists: [], specialistAvailability: [] });
    expect(getPublishedSlugForOrganizationMock).toHaveBeenCalledWith("org-1");
  });
});
