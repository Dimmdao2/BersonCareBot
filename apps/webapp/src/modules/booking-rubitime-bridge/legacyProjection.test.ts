import { describe, expect, it } from "vitest";
import {
  buildLegacyAppointmentPayload,
  mapLegacyStatusToCanonical,
  resolveAppointmentCanonicalRefs,
  resolveDurationAndEnd,
} from "./legacyProjection";

describe("legacyProjection", () => {
  it("maps canceled legacy status", () => {
    expect(mapLegacyStatusToCanonical("canceled", "event-update")).toBe("cancelled_by_patient");
  });

  it("maps staff manual-cancel to cancelled_by_specialist", () => {
    expect(mapLegacyStatusToCanonical("canceled", "manual-cancel")).toBe("cancelled_by_specialist");
  });

  it("maps Rubitime normalized status from payload to be_appointments", () => {
    expect(
      mapLegacyStatusToCanonical("updated", "updated", {
        rubitime_normalized_status: "moved_awaiting",
      }),
    ).toBe("rescheduled");
    expect(
      mapLegacyStatusToCanonical("updated", "updated", {
        rubitime_normalized_status: "awaiting_prepayment",
      }),
    ).toBe("awaiting_payment");
    expect(
      mapLegacyStatusToCanonical("updated", "updated", {
        rubitime_normalized_status: "awaiting_confirmation",
      }),
    ).toBe("manual_review_required");
  });

  it("uses datetime_end for duration", () => {
    const { durationMinutes, endAtIso } = resolveDurationAndEnd("2026-06-01T10:00:00.000Z", {
      datetime_end: "2026-06-01T10:40:00.000Z",
    });
    expect(durationMinutes).toBe(40);
    expect(endAtIso).toBe("2026-06-01T10:40:00.000Z");
  });

  it("uses Rubitime duration field when explicit end is missing", () => {
    const { durationMinutes, endAtIso } = resolveDurationAndEnd("2026-06-01T10:00:00.000Z", {
      duration: "90",
    });
    expect(durationMinutes).toBe(90);
    expect(endAtIso).toBe("2026-06-01T11:30:00.000Z");
  });

  it("extracts rubitime ids from payload", () => {
    const legacy = buildLegacyAppointmentPayload("2026-06-01T10:00:00.000Z", {
      branch_id: "12",
      service_id: "99",
      cooperator_id: "7",
    });
    expect(legacy.rubitimeBranchId).toBe("12");
    expect(legacy.rubitimeServiceId).toBe("99");
    expect(legacy.rubitimeCooperatorId).toBe("7");
    expect(legacy.durationMinutes).toBe(60);
  });

  it("resolves canonical ids via lookup", () => {
    const refs = resolveAppointmentCanonicalRefs(
      {
        resolveCanonicalId(type, id) {
          if (type === "branch" && id === "12") return "b1";
          if (type === "specialist" && id === "7") return "s1";
          if (type === "service" && id === "99") return "svc1";
          return null;
        },
      },
      { rubitimeBranchId: "12", rubitimeServiceId: "99", rubitimeCooperatorId: "7" },
    );
    expect(refs).toEqual({ branchId: "b1", specialistId: "s1", serviceId: "svc1" });
  });

  it("falls back to availability mapping when service entity is missing", () => {
    const refs = resolveAppointmentCanonicalRefs(
      {
        resolveCanonicalId(type, id) {
          if (type === "branch" && id === "12") return "b1";
          if (type === "specialist" && id === "7") return "s1";
          if (type === "availability" && id === "99") return "svc-from-ssa";
          return null;
        },
      },
      { rubitimeBranchId: "12", rubitimeServiceId: "99", rubitimeCooperatorId: "7" },
    );
    expect(refs.serviceId).toBe("svc-from-ssa");
  });
});
