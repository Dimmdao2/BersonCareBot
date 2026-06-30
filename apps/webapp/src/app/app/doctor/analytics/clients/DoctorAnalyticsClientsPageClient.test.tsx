/** @vitest-environment jsdom */

/**
 * AN-11: Подписчики (C1/C2) перенесены из вкладки «Клиенты» в «Приложение».
 * AdminPlatformSubscriberStatsClient больше не монтируется в DoctorAnalyticsClientsPageClient.
 * Тест проверяет: период корректно применяется к записям и назначениям (которые остались),
 * и subscriber-period отсутствует на вкладке клиентов.
 */

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { emptyClientContactBreakdown } from "@/modules/doctor-clients/clientContactSegments";

// DoctorDatePicker — replace calendar popover with a plain input so tests can
// interact via getByTestId / fireEvent.change without calendar UI.
vi.mock("@/shared/ui/doctor/DoctorDatePicker", () => ({
  DoctorDatePicker: ({ value, onChange, testId }: { value: string; onChange: (v: string) => void; testId?: string }) => (
    <input data-testid={testId} type="date" value={value} onChange={(e) => onChange(e.target.value)} />
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
          patientsCount: 0,
          subscribersOnlyCount: 0,
          contactBreakdown: emptyClientContactBreakdown(),
        }}
      />,
    );

    // AN-11: Подписчики теперь на вкладке «Приложение», не «Клиенты»
    expect(screen.queryByTestId("subscriber-period")).toBeNull();

    // Appointments period starts at week default
    expect(periodFrom("appointments-period")).toEqual({ preset: "week", customFrom: "", customTo: "" });

    fireEvent.click(screen.getByRole("button", { name: "Период" }));
    expect(periodFrom("appointments-period")).toEqual({
      preset: "custom",
      customFrom: "2026-05-25",
      customTo: "2026-05-31",
    });

    fireEvent.change(screen.getByTestId("custom-from"), { target: { value: "2026-05-20" } });
    fireEvent.change(screen.getByTestId("custom-to"), { target: { value: "2026-05-27" } });
    // period not applied yet — still original custom
    expect(periodFrom("appointments-period")).toEqual({
      preset: "custom",
      customFrom: "2026-05-25",
      customTo: "2026-05-31",
    });

    fireEvent.click(screen.getByRole("button", { name: "Показать" }));
    expect(periodFrom("appointments-period")).toEqual({
      preset: "custom",
      customFrom: "2026-05-20",
      customTo: "2026-05-27",
    });

    fireEvent.click(screen.getByRole("button", { name: "30 дней" }));
    expect(periodFrom("appointments-period")).toEqual({ preset: "month", customFrom: "", customTo: "" });
  });
});
