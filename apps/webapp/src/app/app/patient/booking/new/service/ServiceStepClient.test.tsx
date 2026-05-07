/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ServiceStepClient } from "./ServiceStepClient";
import { routePaths } from "@/app-layer/routes/paths";
import type { BookingBranchService } from "@/modules/booking-catalog/types";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh, prefetch: vi.fn() }),
}));

function branchService(overrides: Partial<BookingBranchService> = {}): BookingBranchService {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    branchId: "b",
    serviceId: "s",
    specialistId: "sp",
    rubitimeServiceId: "r",
    isActive: true,
    sortOrder: 0,
    createdAt: "",
    updatedAt: "",
    service: {
      id: "s",
      title: "Реабилитация",
      description: null,
      durationMinutes: 60,
      priceMinor: 0,
      isActive: true,
      sortOrder: 0,
      createdAt: "",
      updatedAt: "",
    },
    ...overrides,
  };
}

describe("ServiceStepClient", () => {
  beforeEach(() => {
    push.mockClear();
  });

  it("navigates to slot step with in_person params", async () => {
    const user = userEvent.setup();
    render(
      <ServiceStepClient
        cityCode="msk"
        cityTitle="Москва"
        services={[branchService()]}
        catalogError={null}
      />,
    );
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
    render(<ServiceStepClient cityCode="msk" cityTitle="Москва" services={[]} catalogError={null} />);
    expect(screen.getByText(/Нет доступных услуг в этом городе/i)).toBeInTheDocument();
  });
});
