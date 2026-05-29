import { describe, expect, it } from "vitest";
import { prepaymentContextFromBooking } from "./prepaymentContextFromBooking";
import type { PatientBookingRecord } from "@/modules/patient-booking/types";

function baseRow(overrides: Partial<PatientBookingRecord> = {}): PatientBookingRecord {
  return {
    id: "b1",
    userId: "u1",
    bookingType: "in_person",
    city: "msk",
    category: "general",
    slotStart: "2026-06-01T10:00:00.000Z",
    slotEnd: "2026-06-01T11:00:00.000Z",
    status: "awaiting_payment",
    contactPhone: "+79990001122",
    contactName: "Test",
    contactEmail: null,
    rubitimeId: null,
    rubitimeManageUrl: null,
    canonicalAppointmentId: "appt-1",
    branchServiceId: null,
    cityCodeSnapshot: null,
    branchTitleSnapshot: null,
    serviceTitleSnapshot: null,
    durationMinutesSnapshot: null,
    priceMinorSnapshot: 50000,
    cancelledAt: null,
    cancelReason: null,
    gcalEventId: null,
    reminder24hSent: false,
    reminder2hSent: false,
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    branchId: null,
    serviceId: null,
    rubitimeBranchIdSnapshot: null,
    rubitimeCooperatorIdSnapshot: null,
    rubitimeServiceIdSnapshot: null,
    bookingSource: "native",
    compatQuality: null,
    provenanceCreatedBy: null,
    provenanceUpdatedBy: null,
    ...overrides,
  } satisfies PatientBookingRecord;
}

describe("prepaymentContextFromBooking", () => {
  it("maps online booking to onlineCategory", () => {
    expect(
      prepaymentContextFromBooking(
        baseRow({ bookingType: "online", category: "nutrition", priceMinorSnapshot: null }),
      ),
    ).toEqual({ onlineCategory: "nutrition", servicePriceMinor: null });
  });

  it("maps in-person booking to price snapshot", () => {
    expect(prepaymentContextFromBooking(baseRow({ bookingType: "in_person" }))).toEqual({
      onlineCategory: null,
      servicePriceMinor: 50000,
    });
  });
});
