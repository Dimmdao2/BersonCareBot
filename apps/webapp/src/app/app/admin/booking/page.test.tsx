/** @vitest-environment jsdom */

import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const requireAdminDoctorPageMock = vi.hoisted(() => vi.fn());
const loadBookingAdminOverviewMock = vi.hoisted(() => vi.fn());
const getSettingMock = vi.hoisted(() => vi.fn());
const bookingRulesRenderMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/app/settings/requireAdminDoctorPage", () => ({
  requireAdminDoctorPage: requireAdminDoctorPageMock,
}));

vi.mock("@/app/app/doctor/admin/booking/loadBookingAdminOverview", () => ({
  loadBookingAdminOverview: loadBookingAdminOverviewMock,
}));

vi.mock("@/app/app/doctor/admin/booking/BookingOverviewPanel", () => ({
  BookingOverviewPanel: ({ data }: { data: { organizationRequired?: boolean } }) => (
    <div data-testid="booking-overview">
      {data.organizationRequired ? "Клиника не выбрана" : "Клиника выбрана"}
    </div>
  ),
}));

vi.mock("@/app/app/doctor/admin/booking/BookingRulesPageClient", () => ({
  BookingRulesPageClient: () => {
    bookingRulesRenderMock();
    return <div data-testid="booking-rules" />;
  },
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({ systemSettings: { getSetting: getSettingMock } }),
}));

vi.mock("@/app/app/settings/BookingCatalogHelp", () => ({
  BookingCatalogHelp: () => <div data-testid="booking-help" />,
}));

vi.mock("./PlatformLocationPaletteSection", () => ({
  PlatformLocationPaletteSection: () => <div data-testid="platform-palette" />,
}));

let BookingPage: typeof import("./page").default;

beforeAll(async () => {
  BookingPage = (await import("./page")).default;
});

describe("/app/admin/booking", () => {
  it("keeps a platform principal in the no-organization state and omits clinic rules", async () => {
    loadBookingAdminOverviewMock.mockResolvedValue({
      unavailable: false,
      organizationRequired: true,
    });

    render(await BookingPage());

    expect(requireAdminDoctorPageMock).toHaveBeenCalledOnce();
    expect(loadBookingAdminOverviewMock).toHaveBeenCalledWith(null);
    expect(screen.getByTestId("booking-overview")).toHaveTextContent("Клиника не выбрана");
    expect(screen.queryByTestId("booking-rules")).not.toBeInTheDocument();
    expect(bookingRulesRenderMock).not.toHaveBeenCalled();
    expect(getSettingMock).not.toHaveBeenCalled();
  });
});
