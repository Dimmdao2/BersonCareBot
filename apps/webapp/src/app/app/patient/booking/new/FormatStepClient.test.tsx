/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormatStepClient } from "./FormatStepClient";
import { routePaths } from "@/app-layer/routes/paths";
import { useBookingCatalogCities } from "../../cabinet/useBookingCatalog";

vi.mock("../../cabinet/useBookingCatalog", () => ({
  useBookingCatalogCities: vi.fn(),
}));

const mockUseBookingCatalogCities = vi.mocked(useBookingCatalogCities);

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

describe("FormatStepClient", () => {
  beforeEach(() => {
    push.mockClear();
    mockUseBookingCatalogCities.mockReturnValue({
      loading: false,
      error: null,
      cities: [{ id: "1", code: "msk", title: "Москва" }],
      reload: vi.fn(),
    });
  });

  it("«Москва» navigates to service step with city params", async () => {
    const user = userEvent.setup();
    render(<FormatStepClient />);
    await user.click(screen.getByRole("button", { name: "Москва" }));
    expect(push).toHaveBeenCalledWith(
      `${routePaths.bookingNewService}?cityCode=msk&cityTitle=${encodeURIComponent("Москва")}`,
    );
  });

  it("«Реабилитация (ЛФК)» navigates to intake/lfk", async () => {
    const user = userEvent.setup();
    render(<FormatStepClient />);
    await user.click(screen.getByRole("button", { name: /ЛФК/i }));
    expect(push).toHaveBeenCalledWith(routePaths.intakeLfk);
  });

  it("«Нутрициология (анализы)» navigates to intake/nutrition", async () => {
    const user = userEvent.setup();
    render(<FormatStepClient />);
    await user.click(screen.getByRole("button", { name: /нутрициол/i }));
    expect(push).toHaveBeenCalledWith(routePaths.intakeNutrition);
  });

  it("shows loading text while cities load", () => {
    mockUseBookingCatalogCities.mockReturnValue({
      loading: true,
      error: null,
      cities: [],
      reload: vi.fn(),
    });
    render(<FormatStepClient />);
    expect(screen.getByText("Загрузка городов…")).toBeInTheDocument();
  });
});
