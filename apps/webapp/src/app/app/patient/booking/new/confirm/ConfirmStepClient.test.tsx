/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmStepClient } from "./ConfirmStepClient";
import { routePaths } from "@/app-layer/routes/paths";

const createBooking = vi.fn(async () => true);
const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("../../../cabinet/useCreateBooking", () => ({
  useCreateBooking: () => ({
    submitting: false,
    error: null,
    createBooking,
  }),
}));

const baseProps = {
  slotStart: "2026-04-10T10:00:00.000Z",
  slotEnd: "2026-04-10T11:00:00.000Z",
  defaultName: "Иван",
  defaultPhone: "+79990000000",
  appDisplayTimeZone: "Europe/Moscow",
} as const;

describe("ConfirmStepClient", () => {
  beforeEach(() => {
    createBooking.mockClear();
    push.mockClear();
  });

  it("prefills name and phone from props", () => {
    render(
      <ConfirmStepClient
        type="online"
        category="rehab_lfk"
        {...baseProps}
      />,
    );
    expect(screen.getByLabelText(/Имя/i)).toHaveValue("Иван");
    expect(screen.getByLabelText(/Телефон/i)).toHaveValue("+79990000000");
  });

  it("disables submit when name is empty", async () => {
    const user = userEvent.setup();
    render(
      <ConfirmStepClient
        type="online"
        category="rehab_lfk"
        {...baseProps}
        defaultName=""
      />,
    );

    await user.clear(screen.getByLabelText(/Имя/i));
    const submit = screen.getByRole("button", { name: /Подтвердить запись/i });
    expect(submit).toBeDisabled();
  });

  it("calls createBooking with correct args and navigates to booking hub on success", async () => {
    const user = userEvent.setup();
    render(
      <ConfirmStepClient
        type="in_person"
        cityCode="msk"
        cityTitle="Москва"
        branchServiceId="11111111-1111-4111-8111-111111111111"
        serviceTitle="Сеанс"
        {...baseProps}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Подтвердить запись/i }));

    await waitFor(() => {
      expect(createBooking).toHaveBeenCalledTimes(1);
    });

    expect(createBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        selection: {
          type: "in_person",
          cityCode: "msk",
          cityTitle: "Москва",
          branchServiceId: "11111111-1111-4111-8111-111111111111",
          serviceTitle: "Сеанс",
        },
        slot: {
          startAt: baseProps.slotStart,
          endAt: baseProps.slotEnd,
        },
        contactName: "Иван",
        contactPhone: "+79990000000",
      }),
    );

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith(routePaths.bookingNew);
    });
  });
});
