/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SlotStepClient } from "./SlotStepClient";
import { routePaths } from "@/app-layer/routes/paths";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

const slotA = { startAt: "2026-04-10T10:00:00.000Z", endAt: "2026-04-10T11:00:00.000Z" };

vi.mock("../../../cabinet/useBookingSlots", () => ({
  useBookingSlots: () => ({
    loading: false,
    error: null,
    data: [],
    availableDates: ["2026-04-10"],
    slotsForDate: (d: string | null) => (d === "2026-04-10" ? [slotA] : []),
    reload: vi.fn(),
  }),
}));

describe("SlotStepClient", () => {
  beforeEach(() => {
    push.mockClear();
  });

  it("keeps «Продолжить» disabled until a slot is selected", async () => {
    const user = userEvent.setup();
    render(
      <SlotStepClient
        type="in_person"
        branchServiceId="11111111-1111-4111-8111-111111111111"
        cityCode="msk"
        cityTitle="Москва"
        serviceTitle="Сеанс"
        appDisplayTimeZone="Europe/Moscow"
      />,
    );

    const go = screen.getByRole("button", { name: "Продолжить" });
    expect(go).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /\d{2}:\d{2}\s*-\s*\d{2}:\d{2}/ }));
    expect(go).not.toBeDisabled();
  });

  it("navigates to confirm with date, slot and slotEnd in the query", async () => {
    const user = userEvent.setup();
    render(
      <SlotStepClient
        type="in_person"
        branchServiceId="11111111-1111-4111-8111-111111111111"
        cityCode="msk"
        cityTitle="Москва"
        serviceTitle="Сеанс"
        appDisplayTimeZone="Europe/Moscow"
      />,
    );

    await user.click(screen.getByRole("button", { name: /\d{2}:\d{2}\s*-\s*\d{2}:\d{2}/ }));
    await user.click(screen.getByRole("button", { name: "Продолжить" }));

    expect(push).toHaveBeenCalledTimes(1);
    const url = String(push.mock.calls[0][0]);
    expect(url.startsWith(`${routePaths.bookingNewConfirm}?`)).toBe(true);
    expect(url).toContain("date=2026-04-10");
    expect(url).toContain(`slot=${encodeURIComponent(slotA.startAt)}`);
    expect(url).toContain(`slotEnd=${encodeURIComponent(slotA.endAt)}`);
    expect(url).toContain("type=in_person");
    expect(url).toContain("cityCode=msk");
  });
});
