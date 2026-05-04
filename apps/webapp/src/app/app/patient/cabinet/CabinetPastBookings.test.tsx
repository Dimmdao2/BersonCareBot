/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CabinetPastBookings } from "./CabinetPastBookings";
import type { PatientBookingRecord } from "@/modules/patient-booking/types";
import type { CabinetPastRow } from "./cabinetPastBookingsMerge";

function makeBooking(over: Partial<PatientBookingRecord> = {}): PatientBookingRecord {
  return {
    id: "b1111111-1111-4111-8111-111111111111",
    userId: "u1111111-1111-4111-8111-111111111111",
    bookingType: "in_person",
    city: "moscow",
    category: "general",
    slotStart: "2026-05-01T10:00:00.000Z",
    slotEnd: "2026-05-01T11:00:00.000Z",
    status: "completed",
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

describe("CabinetPastBookings", () => {
  it("opens by default when there are items and shows row status", () => {
    const items: CabinetPastRow[] = [{ kind: "native", booking: makeBooking({ status: "completed" }) }];
    render(<CabinetPastBookings items={items} appDisplayTimeZone="Europe/Moscow" />);
    expect(screen.getByRole("button", { name: /Журнал прошедших приёмов/i })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Завершена")).toBeInTheDocument();
  });

  it("starts collapsed when empty and expands to show empty copy", async () => {
    const user = userEvent.setup();
    render(<CabinetPastBookings items={[]} appDisplayTimeZone="Europe/Moscow" />);
    const trigger = screen.getByRole("button", { name: /Журнал прошедших приёмов/i });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Пока пусто.")).not.toBeInTheDocument();
    await user.click(trigger);
    expect(screen.getByText("Пока пусто.")).toBeInTheDocument();
  });

  it("toggles panel closed when trigger is clicked", async () => {
    const user = userEvent.setup();
    const items: CabinetPastRow[] = [{ kind: "native", booking: makeBooking() }];
    render(<CabinetPastBookings items={items} appDisplayTimeZone="Europe/Moscow" />);
    expect(screen.getByText("Завершена")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Журнал прошедших приёмов/i }));
    expect(screen.queryByText("Завершена")).not.toBeInTheDocument();
  });
});
