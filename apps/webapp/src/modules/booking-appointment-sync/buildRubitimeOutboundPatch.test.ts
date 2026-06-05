import { describe, expect, it } from "vitest";
import { buildRubitimeOutboundPatchFromAppointment } from "./buildRubitimeOutboundPatch";
import type { ReverseMappingLookup } from "./reverseMapping";

describe("buildRubitimeOutboundPatchFromAppointment", () => {
  const reverse: ReverseMappingLookup = {
    resolveRubitimeId(entityType, canonicalId) {
      const map: Record<string, string> = {
        "branch:b1": "17356",
        "specialist:s1": "34729",
        "service:v1": "67591",
      };
      return map[`${entityType}:${canonicalId}`] ?? null;
    },
  };

  it("builds reschedule patch with scope ids", () => {
    const patch = buildRubitimeOutboundPatchFromAppointment(
      {
        startAt: "2026-06-01T09:00:00.000Z",
        endAt: "2026-06-01T10:00:00.000Z",
        branchId: "b1",
        specialistId: "s1",
        serviceId: "v1",
        status: "confirmed",
      },
      reverse,
    );
    expect(patch.record).toBe("2026-06-01T09:00:00.000Z");
    expect(patch.datetime_end).toBe("2026-06-01T10:00:00.000Z");
    expect(patch.branch_id).toBe(17356);
    expect(patch.cooperator_id).toBe(34729);
    expect(patch.service_id).toBe(67591);
  });

  it("sets cancel status", () => {
    const patch = buildRubitimeOutboundPatchFromAppointment(
      {
        startAt: "2026-06-01T09:00:00.000Z",
        endAt: "2026-06-01T10:00:00.000Z",
        branchId: null,
        specialistId: null,
        serviceId: null,
        status: "confirmed",
      },
      reverse,
      { cancel: true },
    );
    expect(patch.status).toBe(4);
    expect(patch.record).toBeUndefined();
  });
});
