/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmStepClient } from "./ConfirmStepClient";
import { bookingNewHref } from "../../bookingNewHref";
import type { RescheduleBookingResult } from "../../../cabinet/useRescheduleBooking";

const mockBooking = {
  id: "booking-id-001",
  slotStart: "2026-04-10T10:00:00.000Z",
  slotEnd: "2026-04-10T11:00:00.000Z",
  status: "confirmed" as const,
  bookingType: "in_person" as const,
  city: "msk",
  category: "general" as const,
  userId: "user-1",
  cancelledAt: null,
  cancelReason: null,
  rubitimeId: null,
  gcalEventId: null,
  contactPhone: "+79990000000",
  contactEmail: null,
  contactName: "Иванов Иван Иванович",
  reminder24hSent: false,
  reminder2hSent: false,
  createdAt: "2026-04-10T09:00:00.000Z",
  updatedAt: "2026-04-10T09:00:00.000Z",
  branchServiceId: null,
  branchId: "550e8400-e29b-41d4-a716-446655440001",
  serviceId: "550e8400-e29b-41d4-a716-446655440002",
  cityCodeSnapshot: "msk",
  branchTitleSnapshot: null,
  serviceTitleSnapshot: "Сеанс",
  durationMinutesSnapshot: null,
  priceMinorSnapshot: null,
  rubitimeBranchIdSnapshot: null,
  rubitimeCooperatorIdSnapshot: null,
  rubitimeServiceIdSnapshot: null,
  rubitimeManageUrl: null,
  canonicalAppointmentId: null,
  bookingSource: "native" as const,
  compatQuality: null,
  provenanceCreatedBy: null,
  provenanceUpdatedBy: null,
};

const createBooking = vi.fn(async () => mockBooking);
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
  defaultFio: { lastName: "Иванов", firstName: "Иван", patronymic: "Иванович" },
  defaultPhone: "+79990000000",
  defaultEmail: "ivan@example.com",
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

  it("prefills FIO, phone and email from props", () => {
    render(
      <ConfirmStepClient
        type="online"
        category="rehab_lfk"
        {...baseProps}
      />,
    );
    expect(screen.getByLabelText(/Фамилия/i)).toHaveValue("Иванов");
    expect(screen.getByLabelText(/Имя/i)).toHaveValue("Иван");
    expect(screen.getByLabelText(/Отчество/i)).toHaveValue("Иванович");
    expect(screen.getByLabelText(/Телефон/i)).toHaveValue("+79990000000");
    expect(screen.getByLabelText(/Email/i)).toHaveValue("ivan@example.com");
  });

  it("disables submit when required surname or given name is empty", async () => {
    const user = userEvent.setup();
    render(
      <ConfirmStepClient
        type="online"
        category="rehab_lfk"
        {...baseProps}
        defaultFio={{ lastName: "", firstName: "Иван", patronymic: null }}
      />,
    );

    await user.clear(screen.getByLabelText(/Фамилия/i));
    const submit = screen.getByRole("button", { name: /Подтвердить запись/i });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText(/Фамилия/i), "Иванов");
    await user.clear(screen.getByLabelText(/Имя/i));
    expect(submit).toBeDisabled();
  });

  it("calls createBooking with correct args and navigates to done screen on success", async () => {
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
        contactName: "Иванов Иван Иванович",
        contactFio: {
          lastName: "Иванов",
          firstName: "Иван",
          patronymic: "Иванович",
        },
        contactPhone: "+79990000000",
        contactEmail: "ivan@example.com",
      }),
    );

    // After successful booking, should navigate to the done (add-to-calendar) screen.
    await waitFor(() => {
      expect(push).toHaveBeenCalledTimes(1);
      const dest: string = push.mock.calls[0]?.[0] ?? "";
      expect(dest).toContain("/app/patient/booking/new/done");
      expect(dest).toContain(`bookingId=${encodeURIComponent(mockBooking.id)}`);
      expect(dest).toContain(`cityCode=msk`);
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
