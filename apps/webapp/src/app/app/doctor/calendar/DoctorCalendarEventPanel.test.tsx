/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { CalendarAppointmentEvent } from "@/modules/booking-calendar/types";

vi.mock("@/app/app/settings/BookingStaffPaymentPanel", () => ({
  BookingStaffPaymentPanel: () => null,
}));
vi.mock("@/app/app/doctor/clients/AppointmentStaffCommentsSection", () => ({
  AppointmentStaffCommentsSection: () => null,
}));

import { DoctorCalendarEventPanel } from "./DoctorCalendarEventPanel";

const baseEvent: CalendarAppointmentEvent = {
  kind: "appointment",
  id: "appointment-1",
  startAt: "2026-07-20T10:00:00.000Z",
  endAt: "2026-07-20T11:00:00.000Z",
  status: "confirmed",
  source: "admin_manual",
  specialistId: null,
  specialistName: null,
  branchId: null,
  branchTitle: null,
  branchColor: null,
  roomId: null,
  roomTitle: null,
  serviceId: null,
  serviceTitle: null,
  platformUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  patientName: "Иванов Иван",
  patientPhone: null,
  bookingStatus: null,
  rubitimeId: null,
  rubitimeManageUrl: null,
  paymentStatus: null,
  prepaymentPending: false,
  packageUsageRef: null,
  packageTitle: null,
  packageDisplayNumber: null,
  rescheduleCount: 0,
  originalStartAt: null,
  formComments: [],
};

const commonProps = {
  apiBase: "/api/doctor/booking-engine",
  timeZone: "Europe/Moscow",
  filterMeta: { specialists: [], branches: [], rooms: [], services: [] },
  activeFilters: { specialistId: null, branchId: null, roomId: null, serviceId: null },
  onClose: vi.fn(),
  onChanged: vi.fn(),
};

describe("DoctorCalendarEventPanel patient heading", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({ ok: true, reschedules: [], cancellations: [] }),
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("links the FIO heading to the canonical patient card when a patient id exists", async () => {
    render(<DoctorCalendarEventPanel {...commonProps} selected={baseEvent} />);
    expect(screen.getByRole("heading", { name: "Иванов Иван" }).querySelector("a")).toHaveAttribute(
      "href",
      "/app/doctor/patients/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  });

  it("keeps the heading plain when the appointment has no canonical patient id", async () => {
    render(
      <DoctorCalendarEventPanel
        {...commonProps}
        selected={{ ...baseEvent, platformUserId: null }}
      />,
    );
    expect(screen.getByRole("heading", { name: "Иванов Иван" }).querySelector("a")).toBeNull();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  });
});
