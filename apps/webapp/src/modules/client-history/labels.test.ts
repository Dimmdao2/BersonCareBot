import { describe, expect, it } from "vitest";
import {
  timelineEventTitle,
  appointmentStatusLabel,
  formatAmountMinor,
  paymentMethodLabel,
  paymentPurposeLabel,
} from "./labels";

describe("client-history labels", () => {
  it("maps known event types", () => {
    expect(timelineEventTitle("appointment_created")).toBe("Запись создана");
    expect(timelineEventTitle("purchase_started")).toBe("Покупка начата");
    expect(timelineEventTitle("unknown_event")).toBe("unknown_event");
  });

  it("formats amount minor", () => {
    expect(formatAmountMinor(15000, "RUB")).toMatch(/150/);
    expect(formatAmountMinor(null, "RUB")).toBeNull();
  });

  it("maps appointment status", () => {
    expect(appointmentStatusLabel("visit_confirmed")).toBe("Посещение подтверждено");
  });

  it("maps payment provider and purpose", () => {
    expect(paymentMethodLabel("mock")).toBe("Тестовая оплата");
    expect(paymentPurposeLabel("package_purchase")).toBe("Покупка абонемента");
  });
});
