import { describe, expect, it } from "vitest";
import { flatExecIds, flatRecReadIds, flatTestSlots } from "@/app/app/patient/treatment/patientProgramItemNavLists";
import type { TreatmentProgramInstanceDetail } from "@/modules/treatment-program/types";

function stageStub(
  id: string,
  sortOrder: number,
  items: TreatmentProgramInstanceDetail["stages"][number]["items"],
  groups: TreatmentProgramInstanceDetail["stages"][number]["groups"] = [],
): TreatmentProgramInstanceDetail["stages"][number] {
  return {
    id,
    instanceId: "i1",
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
    groups,
    items,
  };
}

describe("patientProgramItemNavLists", () => {
  it("flatExecIds excludes test_set and persistent recommendations", () => {
    const stage = stageStub("s1", 1, [
      {
        id: "e1",
        stageId: "s1",
        itemType: "exercise",
        itemRefId: "x",
        sortOrder: 0,
        comment: null,
        localComment: null,
        settings: null,
        snapshot: { title: "Ex" },
        completedAt: null,
        isActionable: true,
        status: "active",
        groupId: null,
        createdAt: "",
        lastViewedAt: null,
        effectiveComment: null,
      },
      {
        id: "ts1",
        stageId: "s1",
        itemType: "test_set",
        itemRefId: "x",
        sortOrder: 1,
        comment: null,
        localComment: null,
        settings: null,
        snapshot: { title: "Set", tests: [] },
        completedAt: null,
        isActionable: true,
        status: "active",
        groupId: null,
        createdAt: "",
        lastViewedAt: null,
        effectiveComment: null,
      },
      {
        id: "r1",
        stageId: "s1",
        itemType: "recommendation",
        itemRefId: "x",
        sortOrder: 2,
        comment: null,
        localComment: null,
        settings: null,
        snapshot: { title: "Persistent", bodyMd: "" },
        completedAt: null,
        isActionable: false,
        status: "active",
        groupId: null,
        createdAt: "",
        lastViewedAt: null,
        effectiveComment: null,
      },
      {
        id: "r2",
        stageId: "s1",
        itemType: "recommendation",
        itemRefId: "x",
        sortOrder: 3,
        comment: null,
        localComment: null,
        settings: null,
        snapshot: { title: "Actionable", bodyMd: "" },
        completedAt: null,
        isActionable: true,
        status: "active",
        groupId: null,
        createdAt: "",
        lastViewedAt: null,
        effectiveComment: null,
      },
    ]);
    const ids = flatExecIds(stage, "full");
    expect(ids).toContain("e1");
    expect(ids).toContain("r2");
    expect(ids).not.toContain("ts1");
    expect(ids).not.toContain("r1");
  });

  it("flatRecReadIds orders working stage persistent then stage-zero persistent", () => {
    const working = stageStub("sw", 1, [
      {
        id: "p1",
        stageId: "sw",
        itemType: "recommendation",
        itemRefId: "x",
        sortOrder: 0,
        comment: null,
        localComment: null,
        settings: null,
        snapshot: { title: "A", bodyMd: "" },
        completedAt: null,
        isActionable: false,
        status: "active",
        groupId: null,
        createdAt: "",
        lastViewedAt: null,
        effectiveComment: null,
      },
    ]);
    const zero = stageStub("sz", 0, [
      {
        id: "p2",
        stageId: "sz",
        itemType: "recommendation",
        itemRefId: "x",
        sortOrder: 0,
        comment: null,
        localComment: null,
        settings: null,
        snapshot: { title: "B", bodyMd: "" },
        completedAt: null,
        isActionable: false,
        status: "active",
        groupId: null,
        createdAt: "",
        lastViewedAt: null,
        effectiveComment: null,
      },
    ]);
    expect(flatRecReadIds(working, [zero])).toEqual(["p1", "p2"]);
  });

  it("flatTestSlots orders test_sets then tests in snapshot order", () => {
    const stage = stageStub("s1", 1, [
      {
        id: "set-b",
        stageId: "s1",
        itemType: "test_set",
        itemRefId: "x",
        sortOrder: 10,
        comment: null,
        localComment: null,
        settings: null,
        snapshot: {
          title: "B",
          tests: [
            { testId: "t2", title: "T2" },
            { testId: "t3", title: "T3" },
          ],
        },
        completedAt: null,
        isActionable: true,
        status: "active",
        groupId: null,
        createdAt: "",
        lastViewedAt: null,
        effectiveComment: null,
      },
      {
        id: "set-a",
        stageId: "s1",
        itemType: "test_set",
        itemRefId: "x",
        sortOrder: 0,
        comment: null,
        localComment: null,
        settings: null,
        snapshot: { title: "A", tests: [{ testId: "t1", title: "T1" }] },
        completedAt: null,
        isActionable: true,
        status: "active",
        groupId: null,
        createdAt: "",
        lastViewedAt: null,
        effectiveComment: null,
      },
    ]);
    expect(flatTestSlots(stage)).toEqual([
      { itemId: "set-a", testId: "t1" },
      { itemId: "set-b", testId: "t2" },
      { itemId: "set-b", testId: "t3" },
    ]);
  });

  it("flatTestSlots returns empty without stage", () => {
    expect(flatTestSlots(null)).toEqual([]);
  });
});
