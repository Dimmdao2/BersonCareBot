import { describe, expect, it } from "vitest";
import type { PatientBookingRecord } from "@/modules/patient-booking/types";
import { nativeBookingSubtitle } from "./patientBookingLabels";

function base(over: Partial<PatientBookingRecord> = {}): PatientBookingRecord {
  return {
    id: "b1",
    userId: "u1",
    bookingType: "in_person",
    city: "moscow",
    category: "general",
    slotStart: "2026-01-01T10:00:00.000Z",
    slotEnd: "2026-01-01T11:00:00.000Z",
    status: "confirmed",
    cancelledAt: null,
    cancelReason: null,
    rubitimeId: null,
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
    ...over,
  };
}

describe("nativeBookingSubtitle", () => {
  it("uses snapshots for in-person v2", () => {
    const s = nativeBookingSubtitle(
      base({
        branchServiceId: "11111111-1111-4111-8111-111111111111",
        cityCodeSnapshot: "moscow",
        serviceTitleSnapshot: "Сеанс 60 мин",
      }),
    );
    expect(s).toContain("Москва");
    expect(s).toContain("Сеанс 60 мин");
  });

  it("falls back to legacy city for old rows", () => {
    expect(nativeBookingSubtitle(base({ city: "spb" }))).toContain("СПб");
  });

  it("labels online categories", () => {
    expect(
      nativeBookingSubtitle(
        base({
          bookingType: "online",
          category: "rehab_lfk",
          city: null,
        }),
      ),
    ).toContain("ЛФК");
  });
});
