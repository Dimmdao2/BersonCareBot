/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ServiceStepClient } from "./ServiceStepClient";
import { routePaths } from "@/app-layer/routes/paths";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

const servicesMock = vi.hoisted(() => ({
  loading: false,
  error: null as string | null,
  services: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      service: { title: "Реабилитация", durationMinutes: 60 },
    },
  ],
}));

vi.mock("../../../cabinet/useBookingCatalog", () => ({
  useBookingCatalogServices: () => ({
    loading: servicesMock.loading,
    error: servicesMock.error,
    services: servicesMock.services,
    reload: vi.fn(),
  }),
}));

describe("ServiceStepClient", () => {
  beforeEach(() => {
    push.mockClear();
    servicesMock.loading = false;
    servicesMock.error = null;
    servicesMock.services = [
      {
        id: "11111111-1111-4111-8111-111111111111",
        service: { title: "Реабилитация", durationMinutes: 60 },
      },
    ];
  });

  it("navigates to slot step with in_person params", async () => {
    const user = userEvent.setup();
    render(<ServiceStepClient cityCode="msk" cityTitle="Москва" />);
    await user.click(screen.getByRole("button", { name: /Реабилитация/ }));
    const url = String(push.mock.calls[0][0]);
    expect(url.startsWith(`${routePaths.bookingNewSlot}?`)).toBe(true);
    expect(url).toContain("type=in_person");
    expect(url).toContain(`cityCode=${encodeURIComponent("msk")}`);
    expect(url).toContain(`cityTitle=${encodeURIComponent("Москва")}`);
    expect(url).toContain("branchServiceId=11111111-1111-4111-8111-111111111111");
    expect(url).toContain(`serviceTitle=${encodeURIComponent("Реабилитация")}`);
  });

  it("shows empty state when there are no services", () => {
    servicesMock.services = [];
    render(<ServiceStepClient cityCode="msk" cityTitle="Москва" />);
    expect(screen.getByText(/Нет доступных услуг в этом городе/i)).toBeInTheDocument();
  });
});
