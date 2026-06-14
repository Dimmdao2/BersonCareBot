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

  // R3: time-only reschedule — patch has record/datetime_end but NO status field
  it("R3: time-only reschedule — patch contains record/datetime_end and NO status", () => {
    const patch = buildRubitimeOutboundPatchFromAppointment(
      {
        startAt: "2026-06-02T11:00:00.000Z",
        endAt: "2026-06-02T12:00:00.000Z",
        branchId: null,
        specialistId: null,
        serviceId: null,
        status: "confirmed", // status unchanged — not cancelled
      },
      reverse,
      // no options.cancel → normal time-update path
    );
    expect(patch.record).toBe("2026-06-02T11:00:00.000Z");
    expect(patch.datetime_end).toBe("2026-06-02T12:00:00.000Z");
    // Time-only reschedule must NOT carry a status field (would wrongly set Rubitime status)
    expect(patch.status).toBeUndefined();
  });

  // X1: staff-cancel uses update-record (status 4), NOT remove-record semantics
  it("X1: cancel patch has status=4 and no time/scope fields (update-record, not remove-record)", () => {
    const cancelPatch = buildRubitimeOutboundPatchFromAppointment(
      {
        startAt: "2026-06-03T09:00:00.000Z",
        endAt: "2026-06-03T10:00:00.000Z",
        branchId: null,
        specialistId: null,
        serviceId: null,
        status: "cancelled_by_specialist",
      },
      reverse,
      { cancel: true },
    );
    // Must be a status-4 update-record payload — NOT an empty/remove-record payload
    expect(cancelPatch.status).toBe(4);
    // No time fields: cancel patch only sets status, confirming update-record not remove-record
    expect(cancelPatch.record).toBeUndefined();
    expect(cancelPatch.datetime_end).toBeUndefined();
    expect(cancelPatch.branch_id).toBeUndefined();
    expect(cancelPatch.cooperator_id).toBeUndefined();
    expect(cancelPatch.service_id).toBeUndefined();
  });
});
