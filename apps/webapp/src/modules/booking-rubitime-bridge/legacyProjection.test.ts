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

  it("uses datetime_end for duration", () => {
    const { durationMinutes, endAtIso } = resolveDurationAndEnd("2026-06-01T10:00:00.000Z", {
      datetime_end: "2026-06-01T10:40:00.000Z",
    });
    expect(durationMinutes).toBe(40);
    expect(endAtIso).toBe("2026-06-01T10:40:00.000Z");
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
});
