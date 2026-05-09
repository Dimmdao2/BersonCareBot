import { describe, expect, it } from "vitest";
import { resolveFirstPendingProgramTabItemId } from "./resolveFirstPendingProgramTabItemId";
import type { TreatmentProgramInstanceDetail } from "@/modules/treatment-program/types";

function stageStub(
  id: string,
  sortOrder: number,
  items: TreatmentProgramInstanceDetail["stages"][number]["items"],
): TreatmentProgramInstanceDetail["stages"][number] {
  return {
    id,
    instanceId: "inst-1",
    sourceStageId: null,
    title: `Stage ${sortOrder}`,
    description: null,
    sortOrder,
    localComment: null,
    skipReason: null,
    status: "in_progress",
    startedAt: null,
    goals: null,
    objectives: null,
    expectedDurationDays: null,
    expectedDurationText: null,
    groups: [],
    items,
  };
}

function exerciseItem(
  id: string,
  stageId: string,
  sortOrder: number,
): TreatmentProgramInstanceDetail["stages"][number]["items"][number] {
  return {
    id,
    stageId,
    itemType: "exercise",
    itemRefId: "ref-ex",
    sortOrder,
    comment: null,
    localComment: null,
    settings: null,
    snapshot: { title: "Упр" },
    completedAt: null,
    isActionable: true,
    status: "active",
    groupId: null,
    createdAt: "",
    lastViewedAt: null,
    effectiveComment: null,
  };
}

const detailBase: Omit<TreatmentProgramInstanceDetail, "stages"> = {
  id: "inst-1",
  patientUserId: "u1",
  templateId: null,
  assignedBy: null,
  title: "План",
  status: "active",
  createdAt: "",
  updatedAt: "",
  patientPlanLastOpenedAt: null,
};

describe("resolveFirstPendingProgramTabItemId", () => {
  it("возвращает первый id из порядка exec, которого нет в done сегодня", () => {
    const s1 = stageStub("stage-1", 1, [
      exerciseItem("item-a", "stage-1", 0),
      exerciseItem("item-b", "stage-1", 1),
    ]);
    const detail: TreatmentProgramInstanceDetail = { ...detailBase, stages: [s1] };
    expect(resolveFirstPendingProgramTabItemId(detail, ["item-a"])).toBe("item-b");
    expect(resolveFirstPendingProgramTabItemId(detail, [])).toBe("item-a");
  });

  it("при неактивной программе возвращает null", () => {
    const s1 = stageStub("stage-1", 1, [exerciseItem("item-a", "stage-1", 0)]);
    const detail: TreatmentProgramInstanceDetail = { ...detailBase, status: "completed", stages: [s1] };
    expect(resolveFirstPendingProgramTabItemId(detail, [])).toBeNull();
  });
});
