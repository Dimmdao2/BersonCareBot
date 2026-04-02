import { describe, expect, it } from "vitest";
import type { PatientBookingRecord } from "@/modules/patient-booking/types";
import { bookingProvenancePrefix, SCHEDULE_RECORD_PROVENANCE_PREFIX } from "./patientBookingLabels";

function baseRow(over: Partial<PatientBookingRecord> = {}): PatientBookingRecord {
  return {
    id: "b1",
    userId: "u1",
    bookingType: "in_person",
    city: null,
    category: "general",
    slotStart: "2026-05-01T10:00:00.000Z",
    slotEnd: "2026-05-01T11:00:00.000Z",
    status: "confirmed",
    cancelledAt: null,
    cancelReason: null,
    rubitimeId: "r1",
    gcalEventId: null,
    contactPhone: "+7000",
    contactEmail: null,
    contactName: "T",
    reminder24hSent: false,
    reminder2hSent: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    branchServiceId: null,
    branchId: null,
    serviceId: null,
    cityCodeSnapshot: null,
    branchTitleSnapshot: null,
    serviceTitleSnapshot: null,
    durationMinutesSnapshot: null,
    priceMinorSnapshot: null,
    rubitimeBranchIdSnapshot: null,
    rubitimeCooperatorIdSnapshot: null,
    rubitimeServiceIdSnapshot: null,
    rubitimeManageUrl: null,
    bookingSource: "native",
    compatQuality: null,
    provenanceCreatedBy: null,
    provenanceUpdatedBy: null,
    ...over,
  };
}

describe("bookingProvenancePrefix", () => {
  it("returns label for rubitime_projection rows", () => {
    expect(bookingProvenancePrefix(baseRow({ bookingSource: "rubitime_projection" }))).toBe("Из расписания · ");
  });

  it("returns empty for native bookings", () => {
    expect(bookingProvenancePrefix(baseRow({ bookingSource: "native" }))).toBe("");
  });

  it("re-exports shared schedule prefix for doctor/projection UIs", () => {
    expect(SCHEDULE_RECORD_PROVENANCE_PREFIX).toBe("Из расписания · ");
  });
});
