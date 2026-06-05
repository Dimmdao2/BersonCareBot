// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ClientContactPieChart } from "./ClientContactPieChart";
import { emptyClientContactBreakdown } from "@/modules/doctor-clients/clientContactSegments";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PieChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Pie: () => null,
  Cell: () => null,
  Tooltip: () => null,
}));

describe("ClientContactPieChart", () => {
  it("opens segment list when legend row is clicked", async () => {
    const user = userEvent.setup();
    const onSegmentClick = vi.fn();
    const breakdown = {
      ...emptyClientContactBreakdown(),
      pie: { ...emptyClientContactBreakdown().pie, telegram_only: 3, max_only: 1 },
    };

    render(<ClientContactPieChart breakdown={breakdown} onSegmentClick={onSegmentClick} />);

    await user.click(screen.getByRole("button", { name: /Только ТГ: 3 — открыть список/i }));
    expect(onSegmentClick).toHaveBeenCalledWith("telegram_only", "Только ТГ");

    await user.click(screen.getByRole("button", { name: /Только Макс: 1 — открыть список/i }));
    expect(onSegmentClick).toHaveBeenCalledWith("max_only", "Только Макс");
  });
});
