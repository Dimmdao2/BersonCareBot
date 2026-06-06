/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { emptyClientContactBreakdown } from "@/modules/doctor-clients/clientContactSegments";

vi.mock("./AdminPlatformSubscriberStatsClient", () => ({
  AdminPlatformSubscriberStatsClient: ({ period }: { period: unknown }) => (
    <div data-testid="subscriber-period">{JSON.stringify(period)}</div>
  ),
}));

vi.mock("./AdminPlatformRegistrationStatsClient", () => ({
  AdminPlatformRegistrationStatsClient: ({ period }: { period: unknown }) => (
    <div data-testid="registration-period">{JSON.stringify(period)}</div>
  ),
}));

vi.mock("./DoctorAnalyticsAppointmentsSection", () => ({
  DoctorAnalyticsAppointmentsSection: ({ period }: { period: unknown }) => (
    <div data-testid="appointments-period">{JSON.stringify(period)}</div>
  ),
}));

vi.mock("./ClientContactPieChart", () => ({
  ClientContactPieChart: () => <div data-testid="client-contact-pie" />,
}));

vi.mock("./MetricAccountsDialog", () => ({
  MetricAccountsDialog: () => null,
}));

import { DoctorAnalyticsClientsPageClient } from "./DoctorAnalyticsClientsPageClient";

function periodFrom(testId: string) {
  return JSON.parse(screen.getByTestId(testId).textContent ?? "{}") as {
    preset: string;
    customFrom: string;
    customTo: string;
  };
}

describe("DoctorAnalyticsClientsPageClient filters", () => {
  it("applies custom period only after clicking show, while presets apply immediately", () => {
    render(
      <DoctorAnalyticsClientsPageClient
        calendarTodayYmd="2026-05-31"
        displayIana="Europe/Moscow"
        clients={{
          total: 0,
          phoneOnly: 0,
          appGuests: 0,
          contactBreakdown: emptyClientContactBreakdown(),
        }}
      />,
    );

    expect(periodFrom("subscriber-period")).toEqual({ preset: "week", customFrom: "", customTo: "" });

    fireEvent.click(screen.getByRole("button", { name: "Период" }));
    expect(periodFrom("subscriber-period")).toEqual({
      preset: "custom",
      customFrom: "2026-05-25",
      customTo: "2026-05-31",
    });

    fireEvent.change(screen.getByLabelText("С"), { target: { value: "2026-05-20" } });
    fireEvent.change(screen.getByLabelText("По"), { target: { value: "2026-05-27" } });
    expect(periodFrom("subscriber-period")).toEqual({
      preset: "custom",
      customFrom: "2026-05-25",
      customTo: "2026-05-31",
    });

    fireEvent.click(screen.getByRole("button", { name: "Показать" }));
    expect(periodFrom("subscriber-period")).toEqual({
      preset: "custom",
      customFrom: "2026-05-20",
      customTo: "2026-05-27",
    });

    fireEvent.click(screen.getByRole("button", { name: "30 дней" }));
    expect(periodFrom("appointments-period")).toEqual({ preset: "month", customFrom: "", customTo: "" });
  });
});
