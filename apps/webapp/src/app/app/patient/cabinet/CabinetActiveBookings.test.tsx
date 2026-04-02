/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CabinetActiveBookings } from "./CabinetActiveBookings";
import type { PatientBookingRecord } from "@/modules/patient-booking/types";

const openExternalLinkInMessenger = vi.hoisted(() => vi.fn());

vi.mock("@/shared/lib/openExternalLinkInMessenger", () => ({
  openExternalLinkInMessenger,
}));

function makeBooking(over: Partial<PatientBookingRecord> = {}): PatientBookingRecord {
  return {
    id: "b1111111-1111-4111-8111-111111111111",
    userId: "u1111111-1111-4111-8111-111111111111",
    bookingType: "in_person",
    city: "moscow",
    category: "general",
    slotStart: "2026-05-01T10:00:00.000Z",
    slotEnd: "2026-05-01T11:00:00.000Z",
    status: "confirmed",
    cancelledAt: null,
    cancelReason: null,
    rubitimeId: "123",
    gcalEventId: null,
    contactPhone: "+79990001122",
    contactEmail: null,
    contactName: "Иван",
    reminder24hSent: false,
    reminder2hSent: false,
    createdAt: "2026-05-01T09:00:00.000Z",
    updatedAt: "2026-05-01T09:00:00.000Z",
    branchServiceId: null,
    branchId: null,
    serviceId: null,
    cityCodeSnapshot: "moscow",
    branchTitleSnapshot: "Филиал",
    serviceTitleSnapshot: "Услуга",
    durationMinutesSnapshot: 60,
    priceMinorSnapshot: 0,
    rubitimeBranchIdSnapshot: "10",
    rubitimeCooperatorIdSnapshot: "20",
    rubitimeServiceIdSnapshot: "30",
    rubitimeManageUrl: null,
    bookingSource: "native",
    compatQuality: null,
    provenanceCreatedBy: null,
    provenanceUpdatedBy: null,
    ...over,
  };
}

describe("CabinetActiveBookings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows and opens manage link only for valid rubitime URL", async () => {
    const user = userEvent.setup();
    render(
      <CabinetActiveBookings
        bookings={[makeBooking({ rubitimeManageUrl: "https://rubitime.ru/record/123" })]}
        appDisplayTimeZone="Europe/Moscow"
      />,
    );
    const button = screen.getByRole("button", { name: "Изменить" });
    await user.click(button);
    expect(openExternalLinkInMessenger).toHaveBeenCalledWith("https://rubitime.ru/record/123");
  });

  it("hides manage action when rubitime URL is absent", () => {
    render(
      <CabinetActiveBookings
        bookings={[makeBooking({ rubitimeManageUrl: null })]}
        appDisplayTimeZone="Europe/Moscow"
      />,
    );
    expect(screen.queryByRole("button", { name: "Изменить" })).not.toBeInTheDocument();
  });

  it("hides manage action for unsafe href and never uses support fallback", () => {
    render(
      <CabinetActiveBookings
        bookings={[makeBooking({ rubitimeManageUrl: "javascript:alert(1)" })]}
        appDisplayTimeZone="Europe/Moscow"
      />,
    );
    expect(screen.queryByRole("button", { name: "Изменить" })).not.toBeInTheDocument();
    expect(openExternalLinkInMessenger).not.toHaveBeenCalled();
  });
});
