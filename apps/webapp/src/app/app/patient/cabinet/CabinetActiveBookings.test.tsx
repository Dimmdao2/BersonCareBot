/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CabinetActiveBookings } from "./CabinetActiveBookings";
import type { PatientBookingRecord } from "@/modules/patient-booking/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
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
    canonicalAppointmentId: null,
    canonicalInPersonContext: null,
    bookingSource: "native",
    compatQuality: null,
    provenanceCreatedBy: null,
    provenanceUpdatedBy: null,
    ...over,
  };
}

describe("CabinetActiveBookings", () => {
  it("renders canonical in-person action, label and calendar data from linked context only", () => {
    const canonicalBranchId = "00000000-0000-4000-8000-0000000000b1";
    const canonicalServiceId = "00000000-0000-4000-8000-0000000000c1";
    render(
      <CabinetActiveBookings
        bookings={[
          makeBooking({
            canonicalAppointmentId: "00000000-0000-4000-8000-0000000000a1",
            branchId: "00000000-0000-4000-8000-0000000000d1",
            serviceId: "00000000-0000-4000-8000-0000000000e1",
            rubitimeManageUrl: "https://rubitime.ru/record/123",
            canonicalInPersonContext: {
              branchId: canonicalBranchId,
              serviceId: canonicalServiceId,
              cityCode: "spb",
              branchTitle: "Клиника на Невском",
              serviceTitle: "Каноническая услуга",
              durationMinutes: 45,
              priceMinor: 250000,
            },
          }),
        ]}
        appDisplayTimeZone="Europe/Moscow"
      />,
    );
    expect(screen.getByText("Очный приём — СПб · Каноническая услуга")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Перенести" })).toHaveAttribute(
      "href",
      expect.stringContaining(`branchId=${canonicalBranchId}`),
    );
    expect(screen.getByRole("link", { name: "Перенести" })).toHaveAttribute(
      "href",
      expect.stringContaining(`serviceId=${canonicalServiceId}`),
    );
    expect(screen.getByRole("link", { name: "Google Календарь" })).toHaveAttribute(
      "href",
      expect.stringContaining("text=%D0%9A%D0%B0%D0%BD%D0%BE%D0%BD%D0%B8%D1%87%D0%B5%D1%81%D0%BA%D0%B0%D1%8F+%D1%83%D1%81%D0%BB%D1%83%D0%B3%D0%B0"),
    );
    expect(screen.queryByRole("button", { name: "Изменить" })).not.toBeInTheDocument();
  });

  it("renders canonical-linked historical rows through canonical navigation, not Rubitime", () => {
    render(
      <CabinetActiveBookings
        bookings={[
          makeBooking({
            id: "00000000-0000-4000-8000-0000000000f1",
            canonicalAppointmentId: "00000000-0000-4000-8000-0000000000a2",
            bookingSource: "imported",
            rubitimeManageUrl: "https://rubitime.ru/record/123",
            canonicalInPersonContext: {
              branchId: "00000000-0000-4000-8000-0000000000b2",
              serviceId: "00000000-0000-4000-8000-0000000000c2",
              cityCode: "moscow",
              branchTitle: "Клиника",
              serviceTitle: "Исторический приём",
              durationMinutes: 60,
              priceMinor: 0,
            },
          }),
        ]}
        appDisplayTimeZone="Europe/Moscow"
      />,
    );
    expect(screen.getByRole("link", { name: "Перенести" })).toHaveAttribute(
      "href",
      expect.stringContaining("branchId=00000000-0000-4000-8000-0000000000b2"),
    );
    expect(screen.queryByRole("button", { name: "Изменить" })).not.toBeInTheDocument();
  });

  it("fails closed for legacy-only and incomplete canonical rows even if Rubitime exposed a manage URL", () => {
    render(
      <CabinetActiveBookings
        bookings={[
          makeBooking({ rubitimeManageUrl: "https://rubitime.ru/record/legacy" }),
          makeBooking({
            id: "00000000-0000-4000-8000-0000000000f2",
            canonicalAppointmentId: "00000000-0000-4000-8000-0000000000a3",
            rubitimeManageUrl: "https://rubitime.ru/record/incomplete",
            canonicalInPersonContext: null,
          }),
        ]}
        appDisplayTimeZone="Europe/Moscow"
      />,
    );
    expect(screen.getAllByText("Очный приём")).toHaveLength(2);
    expect(screen.queryByRole("link", { name: "Перенести" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Изменить" })).not.toBeInTheDocument();
  });

  it("keeps canonical online navigation while never exposing Rubitime manage", () => {
    render(
      <CabinetActiveBookings
        bookings={[
          makeBooking({
            bookingType: "online",
            canonicalAppointmentId: "00000000-0000-4000-8000-0000000000a4",
            rubitimeManageUrl: "https://rubitime.ru/record/online",
          }),
        ]}
        appDisplayTimeZone="Europe/Moscow"
      />,
    );
    expect(screen.getByRole("link", { name: "Перенести" })).toHaveAttribute(
      "href",
      expect.stringContaining("type=online"),
    );
    expect(screen.queryByRole("button", { name: "Изменить" })).not.toBeInTheDocument();
  });
});
