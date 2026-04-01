/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CityStepClient } from "./CityStepClient";
import { routePaths } from "@/app-layer/routes/paths";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

const catalogMock = vi.hoisted(() => ({
  loading: false,
  error: null as string | null,
  cities: [{ id: "c1", code: "msk", title: "Москва" }],
}));

vi.mock("../../../cabinet/useBookingCatalog", () => ({
  useBookingCatalogCities: () => ({
    loading: catalogMock.loading,
    error: catalogMock.error,
    cities: catalogMock.cities,
    reload: vi.fn(),
  }),
}));

describe("CityStepClient", () => {
  beforeEach(() => {
    push.mockClear();
    catalogMock.loading = false;
    catalogMock.error = null;
    catalogMock.cities = [{ id: "c1", code: "msk", title: "Москва" }];
  });

  it("shows loading indicator while cities are loading", () => {
    catalogMock.loading = true;
    catalogMock.cities = [];
    render(<CityStepClient />);
    expect(screen.getByText(/Загрузка городов/i)).toBeInTheDocument();
  });

  it("navigates to service step with city search params", async () => {
    const user = userEvent.setup();
    render(<CityStepClient />);
    await user.click(screen.getByRole("button", { name: "Москва" }));
    expect(push).toHaveBeenCalledWith(
      `${routePaths.bookingNewService}?cityCode=${encodeURIComponent("msk")}&cityTitle=${encodeURIComponent("Москва")}`,
    );
  });
});
