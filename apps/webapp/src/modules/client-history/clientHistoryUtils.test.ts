import { describe, expect, it } from "vitest";
import {
  dedupeTimelineItems,
  enrichPaymentHistoryRow,
  isFinalPaymentEventType,
  isPrepaymentEventType,
  parsePaymentPayloadRefs,
} from "./clientHistoryUtils";
import type { ClientTimelineItem } from "./types";

describe("clientHistoryUtils", () => {
  it("parses productRef for package and product", () => {
    expect(parsePaymentPayloadRefs({ productRef: "patient_package:pkg-1" })).toEqual({
      patientPackageId: "pkg-1",
      productPurchaseId: null,
    });
    expect(parsePaymentPayloadRefs({ productRef: "product_purchase:prod-1" })).toEqual({
      patientPackageId: null,
      productPurchaseId: "prod-1",
    });
  });

  it("dedupes timeline reschedule/cancel against detailed rows", () => {
    const items: ClientTimelineItem[] = [
      {
        id: "t1",
        category: "appointment",
        eventType: "appointment_rescheduled",
        title: "x",
        summary: null,
        occurredAt: "2026-01-02T00:00:00.000Z",
        linkedObjectType: "appointment",
        linkedObjectId: "appt-1",
        appointmentId: "appt-1",
        payload: {},
      },
      {
        id: "r1",
        category: "reschedule",
        eventType: "reschedule",
        title: "y",
        summary: null,
        occurredAt: "2026-01-02T00:00:00.000Z",
        linkedObjectType: "appointment_reschedule",
        linkedObjectId: "r1",
        appointmentId: "appt-1",
        payload: {},
      },
    ];
    expect(dedupeTimelineItems(items)).toHaveLength(1);
    expect(dedupeTimelineItems(items)[0]?.category).toBe("reschedule");
  });

  it("classifies payment event types", () => {
    expect(isPrepaymentEventType("prepayment_captured")).toBe(true);
    expect(isFinalPaymentEventType("prepayment_captured")).toBe(false);
    expect(isFinalPaymentEventType("payment_captured")).toBe(true);
    expect(isFinalPaymentEventType("refund_succeeded")).toBe(false);
  });

  it("dedupes package_usage fallback when history event has same usageId", () => {
    const items: ClientTimelineItem[] = [
      {
        id: "h1",
        category: "package",
        eventType: "consumed",
        title: "x",
        summary: null,
        occurredAt: "2026-01-02T00:00:00.000Z",
        linkedObjectType: "patient_package",
        linkedObjectId: "pkg-1",
        appointmentId: "appt-1",
        payload: { usageId: "usage-1" },
      },
      {
        id: "usage-1",
        category: "package",
        eventType: "consume",
        title: "y",
        summary: null,
        occurredAt: "2026-01-02T00:00:00.000Z",
        linkedObjectType: "package_usage",
        linkedObjectId: "usage-1",
        appointmentId: "appt-1",
        payload: { usageId: "usage-1" },
      },
    ];
    expect(dedupeTimelineItems(items)).toHaveLength(1);
  });

  it("dedupes timeline mirror of payment history event", () => {
    const items: ClientTimelineItem[] = [
      {
        id: "pay-1",
        category: "payment",
        eventType: "payment_captured",
        title: "x",
        summary: null,
        occurredAt: "2026-01-02T00:00:00.000Z",
        linkedObjectType: "payment_history_event",
        linkedObjectId: "pay-1",
        appointmentId: null,
        payload: {},
      },
      {
        id: "timeline-1",
        category: "payment",
        eventType: "payment_captured",
        title: "y",
        summary: null,
        occurredAt: "2026-01-02T00:00:00.000Z",
        linkedObjectType: "payment_history_event",
        linkedObjectId: "pay-1",
        appointmentId: null,
        payload: {},
      },
    ];
    expect(dedupeTimelineItems(items)).toHaveLength(1);
  });

  it("enriches payment row with package title", () => {
    const row = enrichPaymentHistoryRow(
      {
        id: "p1",
        occurredAt: "2026-01-01T00:00:00.000Z",
        eventType: "payment_captured",
        amountMinor: 1000,
        currency: "RUB",
        providerId: "mock",
        status: "succeeded",
        purpose: "package_purchase",
        appointmentId: null,
        paymentId: "pay-1",
        refundId: null,
        comment: null,
        payloadJson: { productRef: "patient_package:pkg-1" },
      },
      {
        serviceByAppt: new Map(),
        packageTitles: new Map([["pkg-1", "Абонемент 10"]]),
        productTitles: new Map(),
        paymentMethodLabel: () => "Тестовая оплата",
      },
    );
    expect(row.packageTitle).toBe("Абонемент 10");
    expect(row.paymentMethodLabel).toBe("Тестовая оплата");
  });

  it("dedupes product_purchased when history event exists", () => {
    const items: ClientTimelineItem[] = [
      {
        id: "ph1",
        category: "product",
        eventType: "purchase_started",
        title: "x",
        summary: "Promo",
        occurredAt: "2026-01-02T00:00:00.000Z",
        linkedObjectType: "product_history_event",
        linkedObjectId: "ph1",
        appointmentId: null,
        payload: { productPurchaseId: "pp-1" },
      },
      {
        id: "pp-1",
        category: "product",
        eventType: "product_purchased",
        title: "y",
        summary: "Promo",
        occurredAt: "2026-01-01T00:00:00.000Z",
        linkedObjectType: "product_purchase",
        linkedObjectId: "pp-1",
        appointmentId: null,
        payload: { productPurchaseId: "pp-1" },
      },
    ];
    expect(dedupeTimelineItems(items)).toHaveLength(1);
    expect(dedupeTimelineItems(items)[0]?.eventType).toBe("purchase_started");
  });
});
