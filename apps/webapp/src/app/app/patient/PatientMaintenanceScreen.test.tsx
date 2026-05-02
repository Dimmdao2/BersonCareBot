/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { PatientMaintenanceScreen } from "./PatientMaintenanceScreen";
import type { PatientBookingRecord } from "@/modules/patient-booking/types";
import type { SessionUser } from "@/shared/types/session";

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/patient",
  useRouter: () => ({
    back: vi.fn(),
    push: vi.fn(),
  }),
}));

vi.mock("@/shared/hooks/usePlatform", () => ({
  usePlatform: () => "mobile" as const,
}));

vi.mock("@/shared/hooks/useReminderUnread", () => ({
  useReminderUnreadCount: () => 0,
}));

const testUser: SessionUser = {
  userId: "u1",
  role: "client",
  displayName: "Test",
  phone: "+79990000000",
  bindings: {},
};

const baseRow: PatientBookingRecord = {
  id: "b1",
  userId: "u1",
  bookingType: "online",
  city: null,
  category: "general",
  slotStart: "2026-06-01T10:00:00.000Z",
  slotEnd: "2026-06-01T11:00:00.000Z",
  status: "confirmed",
  cancelledAt: null,
  cancelReason: null,
  rubitimeId: "r1",
  gcalEventId: null,
  contactPhone: "+1",
  contactEmail: null,
  contactName: "A",
  reminder24hSent: false,
  reminder2hSent: false,
  createdAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-05-01T00:00:00.000Z",
  branchServiceId: null,
  branchId: null,
  serviceId: null,
  cityCodeSnapshot: null,
  branchTitleSnapshot: "Филиал",
  serviceTitleSnapshot: "Услуга",
  durationMinutesSnapshot: 60,
  priceMinorSnapshot: null,
  rubitimeBranchIdSnapshot: null,
  rubitimeCooperatorIdSnapshot: null,
  rubitimeServiceIdSnapshot: null,
  rubitimeManageUrl: "https://rubitime.example/m",
  bookingSource: "native",
  compatQuality: null,
  provenanceCreatedBy: null,
  provenanceUpdatedBy: null,
};

describe("PatientMaintenanceScreen", () => {
  it("renders message and external booking link", () => {
    render(
      <PatientMaintenanceScreen
        user={testUser}
        message="Hello maintenance"
        bookingUrl="https://dmitryberson.rubitime.ru"
        bookings={[]}
        appDisplayTimeZone="Europe/Moscow"
      />,
    );
    expect(screen.getByText("Hello maintenance")).toBeTruthy();
    const link = screen.getByRole("link", { name: /Записаться на приём/i });
    expect(link.getAttribute("href")).toMatch(/dmitryberson\.rubitime\.ru/);
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

  it("falls back to default booking href when URL is not a safe external https link", () => {
    render(
      <PatientMaintenanceScreen
        user={null}
        message="x"
        bookingUrl="javascript:alert(1)"
        bookings={[]}
        appDisplayTimeZone="Europe/Moscow"
      />,
    );
    const link = screen.getByRole("link", { name: /Записаться на приём/i });
    expect(link.getAttribute("href")).toMatch(/^https:\/\//);
    expect(link.getAttribute("href")).toContain("dmitryberson.rubitime.ru");
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
  });
});
