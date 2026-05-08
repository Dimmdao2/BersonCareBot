import { describe, expect, it } from "vitest";
import { parsePatientProgramItemNavMode, resolvePatientProgramItemPage } from "@/app/app/patient/treatment/patientProgramItemPageResolve";
import { flatExecIds } from "@/app/app/patient/treatment/patientProgramItemNavLists";
import type { TreatmentProgramInstanceDetail } from "@/modules/treatment-program/types";

function stageStub(
  id: string,
  sortOrder: number,
  status: TreatmentProgramInstanceDetail["stages"][number]["status"],
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
    status,
    startedAt: null,
    goals: null,
    objectives: null,
    expectedDurationDays: null,
    expectedDurationText: null,
    groups,
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
    snapshot: { title: "Ex" },
    completedAt: null,
    isActionable: true,
    status: "active",
    groupId: null,
    createdAt: "",
    lastViewedAt: null,
    effectiveComment: null,
  };
}

function testSetItem(
  id: string,
  stageId: string,
  sortOrder: number,
  tests: { testId: string; title?: string }[],
): TreatmentProgramInstanceDetail["stages"][number]["items"][number] {
  return {
    id,
    stageId,
    itemType: "clinical_test",
    itemRefId: "ref-ts",
    sortOrder,
    comment: null,
    localComment: null,
    settings: null,
    snapshot: { title: "Set", tests },
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
  id: "i1",
  patientUserId: "u1",
  templateId: null,
  assignedBy: null,
  title: "P",
  status: "active",
  createdAt: "",
  updatedAt: "",
  patientPlanLastOpenedAt: null,
};

describe("patientProgramItemPageResolve", () => {
  it("parsePatientProgramItemNavMode accepts known nav and maps unknown to default", () => {
    expect(parsePatientProgramItemNavMode("exec")).toBe("exec");
    expect(parsePatientProgramItemNavMode("tests")).toBe("tests");
    expect(parsePatientProgramItemNavMode("rec-read")).toBe("rec-read");
    expect(parsePatientProgramItemNavMode("nope")).toBe("default");
    expect(parsePatientProgramItemNavMode(undefined)).toBe("default");
  });

  it("resolve exec rejects clinical_test itemId", () => {
    const sWork = stageStub("s1", 1, "in_progress", [
      exerciseItem("e1", "s1", 0),
      testSetItem("ts1", "s1", 1, [{ testId: "t1" }]),
    ]);
    const detail: TreatmentProgramInstanceDetail = { ...detailBase, stages: [sWork] };
    const r = resolvePatientProgramItemPage({
      detail,
      itemId: "ts1",
      nav: "exec",
      currentWorkingStage: sWork,
      testId: null,
    });
    expect(r).toBeNull();
  });

  it("resolve exec matches flatExecIds order for exercise", () => {
    const sWork = stageStub("s1", 1, "in_progress", [
      exerciseItem("e1", "s1", 0),
      testSetItem("ts1", "s1", 1, [{ testId: "t1" }]),
    ]);
    const detail: TreatmentProgramInstanceDetail = { ...detailBase, stages: [sWork] };
    const r = resolvePatientProgramItemPage({
      detail,
      itemId: "e1",
      nav: "exec",
      currentWorkingStage: sWork,
      testId: null,
    });
    expect(r).not.toBeNull();
    expect(r!.flatOrderedIds).toEqual(flatExecIds(sWork, "full"));
    expect(r!.itemInteraction).toBe("full");
  });

  it("resolve tests requires clinical_test on working stage and valid testId", () => {
    const sWork = stageStub("s1", 1, "in_progress", [
      exerciseItem("e1", "s1", 0),
      testSetItem("ts1", "s1", 1, [
        { testId: "t1", title: "A" },
        { testId: "t2", title: "B" },
      ]),
    ]);
    const detail: TreatmentProgramInstanceDetail = { ...detailBase, stages: [sWork] };

    expect(
      resolvePatientProgramItemPage({
        detail,
        itemId: "e1",
        nav: "tests",
        currentWorkingStage: sWork,
        testId: "t1",
      }),
    ).toBeNull();

    expect(
      resolvePatientProgramItemPage({
        detail,
        itemId: "ts1",
        nav: "tests",
        currentWorkingStage: sWork,
        testId: "bad",
      }),
    ).toBeNull();

    const ok = resolvePatientProgramItemPage({
      detail,
      itemId: "ts1",
      nav: "tests",
      currentWorkingStage: sWork,
      testId: "t2",
    });
    expect(ok).not.toBeNull();
    expect(ok!.resolvedTestId).toBe("t2");
    expect(ok!.testSlots?.length).toBe(2);
  });
});
