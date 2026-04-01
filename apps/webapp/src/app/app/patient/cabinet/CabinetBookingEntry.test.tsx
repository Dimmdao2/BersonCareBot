/** @vitest-environment jsdom */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CabinetBookingEntry } from "./CabinetBookingEntry";
import { routePaths } from "@/app-layer/routes/paths";

describe("CabinetBookingEntry", () => {
  it("renders a link to the booking wizard", () => {
    render(<CabinetBookingEntry />);
    const link = screen.getByRole("link", { name: "Записаться на приём" });
    expect(link).toHaveAttribute("href", routePaths.bookingNew);
  });
});
