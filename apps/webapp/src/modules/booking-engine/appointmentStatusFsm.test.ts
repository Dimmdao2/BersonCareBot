import { describe, expect, it } from "vitest";
import {
  assertValidAppointmentStatusTransition,
  isTerminalAppointmentStatus,
} from "./appointmentStatusFsm";

describe("appointmentStatusFsm", () => {
  it("allows created → confirmed", () => {
    expect(() => assertValidAppointmentStatusTransition("created", "confirmed")).not.toThrow();
  });

  it("rejects terminal → active", () => {
    expect(() => assertValidAppointmentStatusTransition("completed", "confirmed")).toThrow(
      /Недопустимый переход/,
    );
  });

  it("allows manual_review_required → confirmed", () => {
    expect(() =>
      assertValidAppointmentStatusTransition("manual_review_required", "confirmed"),
    ).not.toThrow();
  });

  it("marks cancellation statuses as terminal", () => {
    expect(isTerminalAppointmentStatus("cancelled_by_patient")).toBe(true);
    expect(isTerminalAppointmentStatus("confirmed")).toBe(false);
  });

  it("allows charged_to_package → visit_confirmed for package refund", () => {
    expect(() =>
      assertValidAppointmentStatusTransition("charged_to_package", "visit_confirmed"),
    ).not.toThrow();
  });
});
