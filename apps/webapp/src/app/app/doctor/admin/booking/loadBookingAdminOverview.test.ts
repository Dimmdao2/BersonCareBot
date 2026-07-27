import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const bridgeEnabledMock = vi.hoisted(() => vi.fn());
const mappingSummaryMock = vi.hoisted(() => vi.fn());
const getSettingMock = vi.hoisted(() => vi.fn());
const getDefaultOrganizationIdMock = vi.hoisted(() => vi.fn());
const listBranchesMock = vi.hoisted(() => vi.fn());
const listServicesMock = vi.hoisted(() => vi.fn());
const listSpecialistsMock = vi.hoisted(() => vi.fn());
const listSpecialistServiceAvailabilityMock = vi.hoisted(() => vi.fn());
const listServiceLocationAvailabilityMock = vi.hoisted(() => vi.fn());
const usesWorkingHoursFallbackMock = vi.hoisted(() => vi.fn());
const listWorkingHoursAdminMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    bookingEngine: {
      organization: { getDefaultOrganizationId: getDefaultOrganizationIdMock },
      catalog: {
        listBranches: listBranchesMock,
        listSpecialists: listSpecialistsMock,
      },
      services: {
        listServices: listServicesMock,
        listSpecialistServiceAvailability: listSpecialistServiceAvailabilityMock,
        listServiceLocationAvailability: listServiceLocationAvailabilityMock,
      },
      bridge: {
        isBridgeEnabled: bridgeEnabledMock,
        getMappingSummary: mappingSummaryMock,
      },
    },
    bookingScheduling: {
      usesWorkingHoursFallback: usesWorkingHoursFallbackMock,
      listWorkingHoursAdmin: listWorkingHoursAdminMock,
    },
    systemSettings: {
      getSetting: getSettingMock,
    },
  }),
}));

import { loadBookingAdminOverview } from "./loadBookingAdminOverview";
import { BookingOverviewPanel } from "./BookingOverviewPanel";

describe("loadBookingAdminOverview", () => {
  const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000099";

  beforeEach(() => {
    vi.clearAllMocks();
    listBranchesMock.mockResolvedValue([
      {
        id: "b1",
        isActive: true,
        sortOrder: 0,
        title: "M",
        cityCode: "msk",
        organizationId: ORGANIZATION_ID,
      },
    ]);
    listSpecialistsMock.mockResolvedValue([{ id: "sp1", fullName: "Doc", isActive: true }]);
    listServicesMock.mockResolvedValue([
      { id: "s1", isActive: true, publicWidgetVisible: false, adminManualOnly: false },
    ]);
    listSpecialistServiceAvailabilityMock.mockResolvedValue([
      { branchId: "b1", serviceId: "s1", isActive: true, specialistId: "sp1" },
    ]);
    listServiceLocationAvailabilityMock.mockResolvedValue([]);
    usesWorkingHoursFallbackMock.mockResolvedValue(true);
    listWorkingHoursAdminMock.mockResolvedValue([{ dayOfWeek: 1, isActive: true }]);
  });

  it("returns an explicit no-clinic state for a global admin without reading any tenant", async () => {
    const data = await loadBookingAdminOverview(null);

    expect(data).toEqual({ unavailable: false, organizationRequired: true });
    expect(getDefaultOrganizationIdMock).not.toHaveBeenCalled();
    expect(listBranchesMock).not.toHaveBeenCalled();
    expect(listServicesMock).not.toHaveBeenCalled();
    expect(usesWorkingHoursFallbackMock).not.toHaveBeenCalled();

    const html = renderToStaticMarkup(createElement(BookingOverviewPanel, { data }));
    expect(html).toContain("Клиника не выбрана");
    expect(html).not.toContain("Активных локаций");
    expect(html).not.toContain("09:00–18:00");
  });

  it("keeps clinic staff stats scoped to their explicit organization", async () => {
    bridgeEnabledMock.mockResolvedValue(true);
    mappingSummaryMock.mockResolvedValue({ availabilities: 0 });
    const data = await loadBookingAdminOverview(ORGANIZATION_ID);
    expect(data).toEqual({
      unavailable: false,
      organizationRequired: false,
      stats: {
        bookingEnabled: true,
        activeLocations: 1,
        activeServices: 1,
        patientVisibleServices: 0,
        hasCustomSchedule: false,
        hasUpcomingSchedule: false,
        servicesWithoutAvailability: 0,
      },
      warnings: [
        "Расписание не настроено — используется временный режим 09:00–18:00.",
        "Нет услуг, доступных пациентам для самостоятельной записи.",
      ],
    });
    expect(listBranchesMock).toHaveBeenCalledWith(ORGANIZATION_ID);
    expect(listServicesMock).toHaveBeenCalledWith(ORGANIZATION_ID);
    expect(listSpecialistsMock).toHaveBeenCalledWith(ORGANIZATION_ID);
    expect(listSpecialistServiceAvailabilityMock).toHaveBeenCalledWith(ORGANIZATION_ID);
    expect(listServiceLocationAvailabilityMock).toHaveBeenCalledWith(ORGANIZATION_ID);
    expect(usesWorkingHoursFallbackMock).toHaveBeenCalledWith({ organizationId: ORGANIZATION_ID });
    expect(listWorkingHoursAdminMock).toHaveBeenCalledWith({ organizationId: ORGANIZATION_ID });
    expect(getDefaultOrganizationIdMock).not.toHaveBeenCalled();
    expect(bridgeEnabledMock).not.toHaveBeenCalled();
    expect(mappingSummaryMock).not.toHaveBeenCalled();
    expect(getSettingMock).not.toHaveBeenCalled();
  });
});
