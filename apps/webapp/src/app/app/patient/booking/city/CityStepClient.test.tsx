/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CityStepClient } from "./CityStepClient";
import { routePaths } from "@/app-layer/routes/paths";
import type { BookingCity } from "@/modules/booking-catalog/types";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

function city(overrides: Partial<BookingCity> = {}): BookingCity {
  return {
    id: "c1",
    code: "msk",
    title: "Москва",
    isActive: true,
    sortOrder: 0,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

describe("CityStepClient", () => {
  beforeEach(() => {
    push.mockClear();
  });

  it("navigates to service step with city search params", async () => {
    const user = userEvent.setup();
    render(<CityStepClient cities={[city()]} catalogError={null} />);
    await user.click(screen.getByRole("button", { name: "Москва" }));
    expect(push).toHaveBeenCalledWith(
      `${routePaths.bookingNewService}?cityCode=${encodeURIComponent("msk")}&cityTitle=${encodeURIComponent("Москва")}`,
    );
  });

  it("shows error when catalog failed", () => {
    render(<CityStepClient cities={[]} catalogError="Ошибка сети" />);
    expect(screen.getByText("Ошибка сети")).toBeInTheDocument();
  });
});
