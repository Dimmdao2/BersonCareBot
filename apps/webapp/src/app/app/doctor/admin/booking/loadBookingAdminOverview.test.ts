import { describe, expect, it, vi } from "vitest";

const listMappingsMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    bookingEngine: {
      organization: { getDefaultOrganizationId: async () => "org-1" },
      catalog: {
        listBranches: async () => [{ id: "b1", isActive: true, sortOrder: 0, title: "M", cityCode: "msk", organizationId: "org-1" }],
        listSpecialists: async () => [{ id: "sp1", fullName: "Doc", isActive: true }],
      },
      services: {
        listServices: async () => [{ id: "s1", isActive: true, publicWidgetVisible: true, adminManualOnly: false }],
        listSpecialistServiceAvailability: async () => [{ branchId: "b1", serviceId: "s1", isActive: true, specialistId: "sp1" }],
        listServiceLocationAvailability: async () => [{ branchId: "b1", serviceId: "s1", isActive: true }],
      },
      bridge: {
        isBridgeEnabled: async () => true,
        getMappingSummary: async () => ({ availabilities: 0 }),
      },
    },
    bookingScheduling: {
      usesWorkingHoursFallback: async () => false,
      listWorkingHoursAdmin: async () => [{ dayOfWeek: 1, isActive: true }],
    },
    systemSettings: {
      getSetting: async () => null,
    },
    rubitimeMapping: {
      listMappings: listMappingsMock,
    },
  }),
}));

import { loadBookingAdminOverview } from "./loadBookingAdminOverview";

describe("loadBookingAdminOverview", () => {
  it("adds rubitime mapping warning from rubitimeMapping.listMappings", async () => {
    listMappingsMock.mockResolvedValue({ total: 2, mappedOk: 0, problems: 2, rows: [] });
    const data = await loadBookingAdminOverview();
    expect(data.unavailable).toBe(false);
    if (data.unavailable) return;
    expect(data.warnings.some((w) => w.includes("Неполный Rubitime-маппинг"))).toBe(true);
    expect(listMappingsMock).toHaveBeenCalledWith({ organizationId: "org-1", problemsOnly: true });
  });
});
