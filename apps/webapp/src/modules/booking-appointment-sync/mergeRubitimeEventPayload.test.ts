import { describe, expect, it } from "vitest";
import { mergeRubitimeFanoutIntoPayload } from "./mergeRubitimeEventPayload";

describe("mergeRubitimeFanoutIntoPayload", () => {
  it("merges top-level fanout into payload", () => {
    const merged = mergeRubitimeFanoutIntoPayload(
      { cooperator_id: "old" },
      {
        dateTimeEnd: "2026-06-01T11:00:00.000Z",
        serviceId: "67591",
        rubitimeCooperatorId: "34729",
        integratorBranchId: "17356",
      },
    );
    expect(merged.datetime_end).toBe("2026-06-01T11:00:00.000Z");
    expect(merged.service_id).toBe("67591");
    expect(merged.cooperator_id).toBe("34729");
    expect(merged.branch_id).toBe("17356");
  });
});
