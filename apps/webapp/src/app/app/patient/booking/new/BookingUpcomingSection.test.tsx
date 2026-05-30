/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BookingUpcomingSection } from "./BookingUpcomingSection";
import type { PatientBookingRecord } from "@/modules/patient-booking/types";

vi.mock("@/app/app/patient/cabinet/CabinetBookingActions", () => ({
  CabinetBookingActions: () => <div data-testid="native-booking-actions">native-actions</div>,
}));

const openExternalLinkInMessenger = vi.hoisted(() => vi.fn());

vi.mock("@/shared/lib/openExternalLinkInMessenger", () => ({
  openExternalLinkInMessenger,
}));

function makeBooking(over: Partial<PatientBookingRecord> = {}): PatientBookingRecord {
  return {
    id: "b1111111-1111-4111-8111-111111111111",
    userId: "u1111111-1111-4111-8111-111111111111",
    bookingType: "online",
    city: null,
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
    cityCodeSnapshot: null,
    branchTitleSnapshot: null,
    serviceTitleSnapshot: null,
    durationMinutesSnapshot: null,
    priceMinorSnapshot: null,
    rubitimeBranchIdSnapshot: null,
    rubitimeCooperatorIdSnapshot: null,
    rubitimeServiceIdSnapshot: null,
    rubitimeManageUrl: "https://rubitime.ru/record/123",
    canonicalAppointmentId: null,
    bookingSource: "native",
    compatQuality: null,
    provenanceCreatedBy: null,
    provenanceUpdatedBy: null,
    ...over,
  };
}

describe("BookingUpcomingSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows native actions for canonical booking and hides Rubitime manage", () => {
    render(
      <BookingUpcomingSection
        bookings={[makeBooking({ canonicalAppointmentId: "appt-1" })]}
        appDisplayTimeZone="Europe/Moscow"
      />,
    );
    expect(screen.getByTestId("native-booking-actions")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Управлять" })).not.toBeInTheDocument();
  });

  it("shows Rubitime manage only without canonical appointment", () => {
    render(
      <BookingUpcomingSection
        bookings={[makeBooking({ canonicalAppointmentId: null })]}
        appDisplayTimeZone="Europe/Moscow"
      />,
    );
    expect(screen.queryByTestId("native-booking-actions")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Управлять" })).toBeInTheDocument();
  });
});
