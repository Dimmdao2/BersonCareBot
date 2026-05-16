/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormatStepClient } from "./FormatStepClient";
import { routePaths } from "@/app-layer/routes/paths";
import type { BookingCity } from "@/modules/booking-catalog/types";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh, prefetch: vi.fn() }),
}));

function city(overrides: Partial<BookingCity> = {}): BookingCity {
  return {
    id: "1",
    code: "msk",
    title: "Москва",
    isActive: true,
    sortOrder: 0,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

describe("FormatStepClient", () => {
  beforeEach(() => {
    refresh.mockClear();
  });

  it("«Москва» links to service step with city params", () => {
    render(<FormatStepClient cities={[city()]} catalogError={null} />);
    const link = screen.getByRole("link", { name: "Москва" });
    expect(link).toHaveAttribute(
      "href",
      `${routePaths.bookingNewService}?cityCode=msk&cityTitle=${encodeURIComponent("Москва")}`,
    );
  });

  it("«Реабилитация онлайн» ведёт на форму онлайн-intake (реабилитация)", () => {
    render(<FormatStepClient cities={[city()]} catalogError={null} />);
    const link = screen.getByRole("link", { name: /Реабилитация онлайн/i });
    expect(link).toHaveAttribute("href", routePaths.intakeLfk);
  });

  it("«Нутрициология онлайн» ведёт на форму онлайн-intake (нутрициология)", () => {
    render(<FormatStepClient cities={[city()]} catalogError={null} />);
    const link = screen.getByRole("link", { name: /Нутрициология онлайн/i });
    expect(link).toHaveAttribute("href", routePaths.intakeNutrition);
  });

  it("shows catalog error and retry refreshes router", async () => {
    const user = userEvent.setup();
    render(<FormatStepClient cities={[]} catalogError="Ошибка каталога" />);
    expect(screen.getByText("Ошибка каталога")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Повторить/i }));
    expect(refresh).toHaveBeenCalled();
  });
});
