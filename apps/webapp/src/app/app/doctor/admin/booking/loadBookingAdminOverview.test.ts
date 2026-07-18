import { describe, expect, it, vi } from "vitest";

const bridgeEnabledMock = vi.hoisted(() => vi.fn());
const mappingSummaryMock = vi.hoisted(() => vi.fn());
const getSettingMock = vi.hoisted(() => vi.fn());
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
        listServices: async () => [{ id: "s1", isActive: true, publicWidgetVisible: false, adminManualOnly: false }],
        listSpecialistServiceAvailability: async () => [{ branchId: "b1", serviceId: "s1", isActive: true, specialistId: "sp1" }],
        listServiceLocationAvailability: async () => [],
      },
      bridge: {
        isBridgeEnabled: bridgeEnabledMock,
        getMappingSummary: mappingSummaryMock,
      },
    },
    bookingScheduling: {
      usesWorkingHoursFallback: async () => true,
      listWorkingHoursAdmin: async () => [{ dayOfWeek: 1, isActive: true }],
    },
    systemSettings: {
      getSetting: getSettingMock,
    },
    rubitimeMapping: {
      listMappings: listMappingsMock,
    },
  }),
}));

import { loadBookingAdminOverview } from "./loadBookingAdminOverview";

describe("loadBookingAdminOverview", () => {
  it("keeps canonical operational stats and warnings without consulting Rubitime state or settings", async () => {
    listMappingsMock.mockResolvedValue({ total: 2, mappedOk: 0, problems: 2, rows: [] });
    bridgeEnabledMock.mockResolvedValue(true);
    mappingSummaryMock.mockResolvedValue({ availabilities: 0 });
    const data = await loadBookingAdminOverview();
    expect(data).toEqual({
      unavailable: false,
      stats: {
        bookingEnabled: true,
        activeLocations: 1,
        activeServices: 1,
        patientVisibleServices: 0,
        hasCustomSchedule: false,
        hasUpcomingSchedule: false,
        servicesWithoutAvailability: 1,
      },
      warnings: [
        "1 услуг без доступности в локациях.",
        "Расписание не настроено — используется временный режим 09:00–18:00.",
        "Нет услуг, доступных пациентам для самостоятельной записи.",
      ],
    });
    expect(bridgeEnabledMock).not.toHaveBeenCalled();
    expect(mappingSummaryMock).not.toHaveBeenCalled();
    expect(getSettingMock).not.toHaveBeenCalled();
    expect(listMappingsMock).not.toHaveBeenCalled();
  });
});
