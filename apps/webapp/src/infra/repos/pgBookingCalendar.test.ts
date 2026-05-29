import { describe, expect, it } from "vitest";
import { isPrepaymentPending } from "./pgBookingCalendar";

describe("pgBookingCalendar prepayment flag", () => {
  it("marks awaiting_payment appointments", () => {
    expect(isPrepaymentPending("awaiting_payment", null)).toBe(true);
  });

  it("marks pending payment intents", () => {
    expect(isPrepaymentPending("confirmed", "pending")).toBe(true);
    expect(isPrepaymentPending("confirmed", "requires_action")).toBe(true);
  });

  it("is false for captured payments", () => {
    expect(isPrepaymentPending("paid", "succeeded")).toBe(false);
  });
});
