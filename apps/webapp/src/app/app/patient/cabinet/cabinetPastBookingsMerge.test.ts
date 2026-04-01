import { describe, expect, it } from "vitest";
import type { PastAppointmentSummary } from "@/modules/appointments/service";
import type { PatientBookingRecord } from "@/modules/patient-booking/types";
import { mergePastBookingHistory } from "./cabinetPastBookingsMerge";

function makeNative(partial: Partial<PatientBookingRecord> & Pick<PatientBookingRecord, "id" | "slotStart">): PatientBookingRecord {
  return {
    userId: "u1",
    bookingType: "online",
    city: null,
    category: "general",
    slotEnd: partial.slotStart,
    status: "completed",
    cancelledAt: null,
    cancelReason: null,
    gcalEventId: null,
    contactPhone: "+7000",
    contactEmail: null,
    contactName: "T",
    reminder24hSent: false,
    reminder2hSent: false,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    rubitimeId: null,
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
    ...partial,
  };
}

describe("mergePastBookingHistory", () => {
  it("drops projection row when native history has same rubitimeId", () => {
    const native = makeNative({
      id: "b1",
      rubitimeId: "rub-1",
      slotStart: "2025-06-01T10:00:00.000Z",
    });
    const proj: PastAppointmentSummary = {
      id: "rub-1",
      dateLabel: "1 июн.",
      timeLabel: "13:00",
      label: "L",
      link: null,
      status: "confirmed",
      recordAtIso: "2025-06-01T10:00:00.000Z",
    };
    const rows = mergePastBookingHistory([native], [proj]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe("native");
  });

  it("sorts newest first by slot / recordAtIso", () => {
    const older = makeNative({ id: "o", slotStart: "2025-01-01T10:00:00.000Z" });
    const newer = makeNative({ id: "n", slotStart: "2025-03-01T10:00:00.000Z" });
    const proj: PastAppointmentSummary = {
      id: "p-only",
      dateLabel: "d",
      timeLabel: "t",
      label: "L",
      link: null,
      status: "confirmed",
      recordAtIso: "2025-02-15T12:00:00.000Z",
    };
    const rows = mergePastBookingHistory([older, newer], [proj]);
    expect(rows.map((r) => (r.kind === "native" ? r.booking.id : r.past.id))).toEqual(["n", "p-only", "o"]);
  });

  it("keeps legacy and v2 native rows in one merged list (mixed history)", () => {
    const legacy = makeNative({
      id: "legacy-1",
      bookingType: "in_person",
      city: "spb",
      branchServiceId: null,
      serviceTitleSnapshot: null,
      slotStart: "2025-04-01T10:00:00.000Z",
    });
    const v2 = makeNative({
      id: "v2-1",
      bookingType: "in_person",
      city: "moscow",
      branchServiceId: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
      cityCodeSnapshot: "moscow",
      serviceTitleSnapshot: "Сеанс",
      slotStart: "2025-05-01T10:00:00.000Z",
    });
    const rows = mergePastBookingHistory([legacy, v2], []);
    expect(rows).toHaveLength(2);
    const first = rows[0];
    const second = rows[1];
    expect(first?.kind).toBe("native");
    expect(second?.kind).toBe("native");
    if (first?.kind === "native" && second?.kind === "native") {
      expect(first.booking.id).toBe("v2-1");
      expect(first.booking.serviceTitleSnapshot).toBe("Сеанс");
      expect(second.booking.id).toBe("legacy-1");
      expect(second.booking.branchServiceId).toBeNull();
    }
  });
});
