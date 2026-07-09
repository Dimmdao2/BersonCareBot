/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SlotStepClient } from "./SlotStepClient";
import { routePaths } from "@/app-layer/routes/paths";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

const slotA = { startAt: "2026-04-10T10:00:00.000Z", endAt: "2026-04-10T11:00:00.000Z" };
const slotB = { startAt: "2026-05-05T10:00:00.000Z", endAt: "2026-05-05T11:00:00.000Z" };

let availableDatesMock: string[] = ["2026-04-10"];
let slotsByDateMock: Record<string, typeof slotA[]> = { "2026-04-10": [slotA] };

vi.mock("../../../cabinet/useBookingSlots", () => ({
  useBookingSlots: () => ({
    loading: false,
    error: null,
    data: [],
    availableDates: availableDatesMock,
    slotsForDate: (d: string | null) => (d ? (slotsByDateMock[d] ?? []) : []),
    reload: vi.fn(),
  }),
}));

describe("SlotStepClient", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-04-01T09:00:00.000Z"));
    push.mockClear();
    availableDatesMock = ["2026-04-10"];
    slotsByDateMock = { "2026-04-10": [slotA] };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps «Продолжить» disabled until a slot is selected", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <SlotStepClient
        type="in_person"
        branchServiceId="11111111-1111-4111-8111-111111111111"
        cityCode="msk"
        cityTitle="Москва"
        serviceTitle="Сеанс"
        durationMinutes={60}
        appDisplayTimeZone="Europe/Moscow"
      />,
    );

    const go = screen.getByRole("button", { name: "Продолжить" });
    expect(go).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /\d{2}:\d{2}\s*-\s*\d{2}:\d{2}/ }));
    expect(go).not.toBeDisabled();
  });

  it("navigates to confirm with date, slot and slotEnd in the query", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <SlotStepClient
        type="in_person"
        branchId="550e8400-e29b-41d4-a716-446655440001"
        serviceId="550e8400-e29b-41d4-a716-446655440002"
        cityCode="msk"
        cityTitle="Москва"
        serviceTitle="Сеанс"
        durationMinutes={60}
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
    expect(url).toContain("branchId=");
    expect(url).toContain("serviceId=");
  });

  it("renders a monthly day grid with today marker, disabled past dates and next-month navigation by slots", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.setSystemTime(new Date("2026-04-10T09:00:00.000Z"));
    availableDatesMock = ["2026-04-09", "2026-04-10", "2026-05-05"];
    slotsByDateMock = {
      "2026-04-09": [{ startAt: "2026-04-09T10:00:00.000Z", endAt: "2026-04-09T11:00:00.000Z" }],
      "2026-04-10": [slotA],
      "2026-05-05": [slotB],
    };

    render(
      <SlotStepClient
        type="in_person"
        branchServiceId="11111111-1111-4111-8111-111111111111"
        cityCode="msk"
        cityTitle="Москва"
        serviceTitle="Сеанс"
        durationMinutes={60}
        appDisplayTimeZone="Europe/Moscow"
      />,
    );

    expect(screen.getByText("Сегодня")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /чт, 09\.04, нет доступных слотов/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /пт, 10\.04, сегодня, есть слоты/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await user.click(screen.getByRole("button", { name: "Следующий месяц" }));
    expect(screen.getByRole("button", { name: /вт, 05\.05, есть слоты/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Следующий месяц" })).toBeDisabled();
  });

  it("does not render duration selector", () => {
    render(
      <SlotStepClient
        type="in_person"
        branchServiceId="11111111-1111-4111-8111-111111111111"
        cityCode="msk"
        cityTitle="Москва"
        serviceTitle="Сеанс"
        durationMinutes={60}
        appDisplayTimeZone="Europe/Moscow"
      />,
    );
    expect(screen.queryByText("Длительность")).toBeNull();
  });
});
