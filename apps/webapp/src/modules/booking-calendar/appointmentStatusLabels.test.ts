import { describe, expect, it } from "vitest";
import {
  appointmentStatusLabel,
  isCancelledAppointmentStatus,
  isStaffDeletableCancelledStatus,
  STAFF_DELETABLE_STATUSES,
} from "./appointmentStatusLabels";

describe("appointmentStatusLabels", () => {
  it("maps known statuses to Russian labels", () => {
    expect(appointmentStatusLabel("confirmed")).toBe("Подтверждена");
    expect(appointmentStatusLabel("awaiting_payment")).toBe("Ожидает оплаты");
  });

  it("detects cancelled statuses", () => {
    expect(isCancelledAppointmentStatus("cancelled_by_patient")).toBe(true);
    expect(isCancelledAppointmentStatus("confirmed")).toBe(false);
  });

  it("staff deletable whitelist excludes no_show", () => {
    expect(STAFF_DELETABLE_STATUSES).toContain("cancelled_by_patient");
    expect(isStaffDeletableCancelledStatus("cancelled_by_specialist")).toBe(true);
    expect(isStaffDeletableCancelledStatus("late_cancellation")).toBe(true);
    expect(isStaffDeletableCancelledStatus("no_show")).toBe(false);
    expect(isStaffDeletableCancelledStatus("confirmed")).toBe(false);
    expect(isCancelledAppointmentStatus("no_show")).toBe(true);
  });
});
