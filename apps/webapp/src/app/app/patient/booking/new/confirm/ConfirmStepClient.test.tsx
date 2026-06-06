/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmStepClient } from "./ConfirmStepClient";
import { bookingNewHref } from "../../bookingNewHref";
import type { RescheduleBookingResult } from "../../../cabinet/useRescheduleBooking";

const createBooking = vi.fn(async () => true);
const rescheduleBooking = vi.fn(async (): Promise<RescheduleBookingResult> => ({ ok: true }));
const push = vi.fn();
const partialToast = vi.fn();

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

vi.mock("../../../cabinet/useRescheduleBooking", () => ({
  useRescheduleBooking: () => ({
    submitting: false,
    error: null,
    rescheduleBooking,
    successRedirectPath: "/app/patient/cabinet",
  }),
}));

vi.mock("@/shared/booking/bookingPartialOutcomeToast", () => ({
  showBookingPartialOutcomeToast: (...args: unknown[]) => partialToast(...args),
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
    rescheduleBooking.mockClear();
    partialToast.mockClear();
    push.mockClear();
    rescheduleBooking.mockResolvedValue({ ok: true });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, fields: [] }),
      } as Response),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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
        branchId="550e8400-e29b-41d4-a716-446655440001"
        serviceId="550e8400-e29b-41d4-a716-446655440002"
        serviceTitle="Сеанс"
        successRedirectPath={bookingNewHref("msk")}
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
          branchId: "550e8400-e29b-41d4-a716-446655440001",
          serviceId: "550e8400-e29b-41d4-a716-446655440002",
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
      expect(push).toHaveBeenCalledWith(bookingNewHref("msk"));
    });
  });

  it("shows partial outcome toast on reschedule when rubitime mirror failed", async () => {
    rescheduleBooking.mockResolvedValue({
      ok: true,
      partial: { rubitimeMirrorFailed: true },
    });
    const user = userEvent.setup();
    render(
      <ConfirmStepClient
        type="online"
        category="general"
        rescheduleBookingId="550e8400-e29b-41d4-a716-446655440099"
        {...baseProps}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Подтвердить запись/i }));

    await waitFor(() => {
      expect(rescheduleBooking).toHaveBeenCalledTimes(1);
      expect(partialToast).toHaveBeenCalledWith({ rubitimeMirrorFailed: true });
    });
  });
});
