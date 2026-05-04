/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppointmentStatusBadge } from "./AppointmentStatusBadge";
import { TooltipProvider } from "@/components/ui/tooltip";

describe("AppointmentStatusBadge", () => {
  it("returns null in history mode for non-cancelled non-rescheduled", () => {
    const { container } = render(
      <AppointmentStatusBadge status="confirmed" mode="history" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows «Записан» for upcoming created/confirmed", () => {
    render(<AppointmentStatusBadge status="confirmed" mode="upcoming" />);
    expect(screen.getByText("Записан")).toBeInTheDocument();
  });

  it("shows cancelled label in history", () => {
    render(<AppointmentStatusBadge status="cancelled" mode="history" />);
    expect(screen.getByText("Отменён")).toBeInTheDocument();
  });

  it("wraps cancelled with reason in tooltip", async () => {
    render(
      <TooltipProvider>
        <AppointmentStatusBadge status="cancelled" cancelReason="Перенос по болезни" mode="upcoming" />
      </TooltipProvider>,
    );
    expect(screen.getByText("Отменён")).toBeInTheDocument();
  });
});
