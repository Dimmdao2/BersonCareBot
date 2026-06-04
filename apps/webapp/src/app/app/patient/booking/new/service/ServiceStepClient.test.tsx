/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ServiceStepClient } from "./ServiceStepClient";
import { routePaths } from "@/app-layer/routes/paths";
import type { InPersonServiceListItem } from "@/modules/patient-booking/inPersonServicesCatalog";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh, prefetch: vi.fn() }),
}));

function service(overrides: Partial<InPersonServiceListItem> = {}): InPersonServiceListItem {
  return {
    id: "550e8400-e29b-41d4-a716-446655440002",
    title: "Реабилитация",
    description: null,
    durationMinutes: 60,
    priceMinor: 0,
    ...overrides,
  };
}

describe("ServiceStepClient", () => {
  beforeEach(() => {
    push.mockClear();
  });

  it("navigates to slot step with canonical branchId and serviceId", async () => {
    const user = userEvent.setup();
    render(
      <ServiceStepClient
        cityCode="msk"
        cityTitle="Москва"
        branchId="550e8400-e29b-41d4-a716-446655440001"
        services={[service()]}
        catalogError={null}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Реабилитация/ }));
    const url = String(push.mock.calls[0][0]);
    expect(url.startsWith(`${routePaths.bookingNewSlot}?`)).toBe(true);
    expect(url).toContain("type=in_person");
    expect(url).toContain(`cityCode=${encodeURIComponent("msk")}`);
    expect(url).toContain(`cityTitle=${encodeURIComponent("Москва")}`);
    expect(url).toContain(`branchId=${encodeURIComponent("550e8400-e29b-41d4-a716-446655440001")}`);
    expect(url).toContain(`serviceId=${encodeURIComponent("550e8400-e29b-41d4-a716-446655440002")}`);
    expect(url).toContain(`serviceTitle=${encodeURIComponent("Реабилитация")}`);
  });

  it("shows empty state when there are no services", () => {
    render(
      <ServiceStepClient
        cityCode="msk"
        cityTitle="Москва"
        branchId="550e8400-e29b-41d4-a716-446655440001"
        services={[]}
        catalogError={null}
      />,
    );
    expect(screen.getByText(/Нет доступных услуг в этом городе/i)).toBeInTheDocument();
  });
});
