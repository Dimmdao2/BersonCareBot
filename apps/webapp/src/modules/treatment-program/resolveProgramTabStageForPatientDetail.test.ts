import { describe, expect, it } from "vitest";
import type { TreatmentProgramInstanceDetail } from "./types";
import { resolveProgramTabStageForPatientDetail } from "./resolveProgramTabStageForPatientDetail";

const now = "2026-01-01T00:00:00.000Z";

function mkStage(
  id: string,
  sortOrder: number,
  status: TreatmentProgramInstanceDetail["stages"][number]["status"],
  withItem = true,
): TreatmentProgramInstanceDetail["stages"][number] {
  return {
    id,
    instanceId: "11111111-1111-4111-8111-111111111111",
    sourceStageId: null,
    title: `Stage ${sortOrder}`,
    description: null,
    sortOrder,
    localComment: null,
    skipReason: null,
    status,
    startedAt: null,
    goals: null,
    objectives: null,
    expectedDurationDays: null,
    expectedDurationText: null,
    groups: [],
    items: withItem
      ? [
          {
            id: `${id}-item`,
            stageId: id,
            itemType: "recommendation",
            itemRefId: "55555555-5555-4555-8555-555555555555",
            sortOrder: 0,
            comment: null,
            localComment: null,
            settings: null,
            snapshot: { title: "Item" },
            completedAt: null,
            isActionable: true,
            status: "active",
            groupId: null,
            createdAt: now,
            lastViewedAt: null,
            effectiveComment: null,
          },
        ]
      : [],
  };
}

describe("resolveProgramTabStageForPatientDetail", () => {
  it("uses available pipeline stage when present", () => {
    const detail = {
      stages: [mkStage("z", 0, "available"), mkStage("a", 1, "completed"), mkStage("b", 2, "available")],
    } as Pick<TreatmentProgramInstanceDetail, "stages">;
    expect(resolveProgramTabStageForPatientDetail(detail)?.id).toBe("b");
  });

  it("falls back to stage zero when pipeline is empty (all FSM stages completed)", () => {
    const detail = {
      stages: [mkStage("z", 0, "available"), mkStage("a", 1, "completed"), mkStage("b", 2, "completed")],
    } as Pick<TreatmentProgramInstanceDetail, "stages">;
    expect(resolveProgramTabStageForPatientDetail(detail)?.id).toBe("z");
  });

  it("returns first locked pipeline stage when no in_progress/available", () => {
    const detail = {
      stages: [mkStage("a", 1, "completed"), mkStage("b", 2, "locked")],
    } as Pick<TreatmentProgramInstanceDetail, "stages">;
    expect(resolveProgramTabStageForPatientDetail(detail)?.id).toBe("b");
  });
});
