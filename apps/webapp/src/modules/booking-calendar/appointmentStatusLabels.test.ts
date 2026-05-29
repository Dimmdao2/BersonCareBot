import { describe, expect, it } from "vitest";
import { appointmentStatusLabel, isCancelledAppointmentStatus } from "./appointmentStatusLabels";

describe("appointmentStatusLabels", () => {
  it("maps known statuses to Russian labels", () => {
    expect(appointmentStatusLabel("confirmed")).toBe("Подтверждена");
    expect(appointmentStatusLabel("awaiting_payment")).toBe("Ожидает оплаты");
  });

  it("detects cancelled statuses", () => {
    expect(isCancelledAppointmentStatus("cancelled_by_patient")).toBe(true);
    expect(isCancelledAppointmentStatus("confirmed")).toBe(false);
  });
});
