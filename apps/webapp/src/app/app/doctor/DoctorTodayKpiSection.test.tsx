// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DoctorTodayKpiSection } from "./DoctorTodayKpiSection";

vi.mock("./analytics/clients/MetricAccountsDialog", () => ({
  MetricAccountsDialog: ({
    open,
    metric,
    apiPath,
  }: {
    open: boolean;
    metric: string | null;
    apiPath?: string;
  }) =>
    open ? (
      <div data-testid="metric-dialog" data-metric={metric ?? ""} data-api={apiPath ?? ""} />
    ) : null,
}));

const kpiStats = {
  appointments: { total: 4, cancellations30d: 1 },
  clients: {},
} as import("@/modules/doctor-stats/service").DoctorStatsState;

describe("DoctorTodayKpiSection", () => {
  it("opens today appointments drill-down dialog on KPI click", () => {
    render(
      <DoctorTodayKpiSection
        kpiStats={kpiStats}
        appointmentsTodayCount={3}
        unreadMessagesCount={2}
      />,
    );
    fireEvent.click(screen.getByText("Записи сегодня"));
    const dialog = screen.getByTestId("metric-dialog");
    expect(dialog).toHaveAttribute("data-metric", "today_appointments_today");
    expect(dialog).toHaveAttribute("data-api", "/api/doctor/analytics-metric-accounts");
  });
});
