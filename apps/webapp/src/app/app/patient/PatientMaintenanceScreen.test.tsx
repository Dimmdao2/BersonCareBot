/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import {
  PatientMaintenanceScreen,
  selectMaintenanceUpcomingBookings,
  type PatientMaintenanceBooking,
} from "./PatientMaintenanceScreen";
import type { ClientVisitHistoryRow } from "@/modules/client-history/types";
import type { SessionUser } from "@/shared/types/session";

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/patient",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({
    back: vi.fn(),
    push: vi.fn(),
  }),
}));

vi.mock("@/shared/hooks/usePlatform", () => ({
  usePlatform: () => "mobile" as const,
}));


const testUser: SessionUser = {
  userId: "u1",
  role: "client",
  displayName: "Test",
  phone: "+79990000000",
  bindings: {},
};

const baseRow: PatientMaintenanceBooking = {
  id: "b1",
  startAt: "2026-06-01T10:00:00.000Z",
  status: "confirmed",
  branchTitle: "Филиал",
  serviceTitle: "Услуга",
};

describe("PatientMaintenanceScreen", () => {
  it("renders message and external booking link", () => {
    render(
      <PatientMaintenanceScreen
        user={testUser}
        message="Hello maintenance"
        bookingUrl="https://booking.example.test"
        bookings={[]}
        appDisplayTimeZone="Europe/Moscow"
      />,
    );
    expect(screen.getByText("Hello maintenance")).toBeTruthy();
    const link = screen.getByRole("link", { name: /Записаться на приём/i });
    expect(link.getAttribute("href")).toBe("https://booking.example.test");
  });

  it("shows empty bookings state", () => {
    render(
      <PatientMaintenanceScreen
        user={null}
        message="x"
        bookingUrl="https://example.com"
        bookings={[]}
        appDisplayTimeZone="Europe/Moscow"
      />,
    );
    expect(screen.getByText(/Нет предстоящих записей/i)).toBeTruthy();
  });

  it("omits the booking CTA when there is no single organization URL", () => {
    render(
      <PatientMaintenanceScreen
        user={null}
        message="x"
        bookingUrl={null}
        bookings={[]}
        appDisplayTimeZone="Europe/Moscow"
      />,
    );
    expect(screen.queryByRole("link", { name: /Записаться на приём/i })).toBeNull();
  });

  it("lists upcoming bookings", () => {
    render(
      <PatientMaintenanceScreen
        user={null}
        message="x"
        bookingUrl="https://example.com"
        bookings={[baseRow]}
        appDisplayTimeZone="Europe/Moscow"
      />,
    );
    const section = screen.getByText(/Ближайшие записи/i).closest("section");
    expect(section).toBeTruthy();
    const withinSection = within(section!);
    expect(withinSection.getAllByRole("listitem").length).toBe(1);
    expect(withinSection.getByText("Услуга · Филиал")).toBeTruthy();
  });

  it("selects canonical active future visits and sorts them ascending", () => {
    const visit = (overrides: Partial<ClientVisitHistoryRow>): ClientVisitHistoryRow => ({
      appointmentId: "visit",
      startAt: "2026-07-20T10:00:00.000Z",
      endAt: "2026-07-20T11:00:00.000Z",
      durationMinutes: 60,
      status: "confirmed",
      specialistName: null,
      branchTitle: null,
      roomTitle: null,
      serviceTitle: null,
      wasViaPackage: false,
      packageUsageSummary: null,
      prepaymentAmountMinor: null,
      prepaymentCurrency: null,
      finalPaymentAmountMinor: null,
      finalPaymentCurrency: null,
      staffComment: null,
      ...overrides,
    });

    expect(
      selectMaintenanceUpcomingBookings(
        [
          visit({ appointmentId: "later", startAt: "2026-07-21T10:00:00.000Z" }),
          visit({ appointmentId: "cancelled", status: "cancelled" }),
          visit({ appointmentId: "past", startAt: "2026-07-10T10:00:00.000Z" }),
          visit({ appointmentId: "earlier", startAt: "2026-07-20T10:00:00.000Z" }),
        ],
        new Date("2026-07-16T00:00:00.000Z"),
      ).map((row) => row.id),
    ).toEqual(["earlier", "later"]);
  });
});
