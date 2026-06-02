import { describe, expect, it } from "vitest";
import type { TreatmentProgramInstanceDetail } from "@/modules/treatment-program/types";
import { buildDoctorClientCarePlanOverview } from "./buildDoctorClientCarePlanOverview";

function makeDetail(over: Partial<TreatmentProgramInstanceDetail> = {}): TreatmentProgramInstanceDetail {
  return {
    id: "inst-1",
    title: "План А",
    status: "active",
    templateId: null,
    patientUserId: "p1",
    assignedBy: null,
    assignmentSource: "doctor",
    patientPlanLastOpenedAt: null,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    stages: [
      {
        id: "st-0",
        instanceId: "inst-1",
        sourceStageId: null,
        title: "Общие",
        description: null,
        sortOrder: 0,
        localComment: null,
        skipReason: null,
        status: "available",
        startedAt: null,
        goals: null,
        objectives: null,
        expectedDurationDays: null,
        expectedDurationText: null,
        groups: [],
        items: [],
      },
      {
        id: "st-1",
        instanceId: "inst-1",
        sourceStageId: null,
        title: "Этап 1",
        description: null,
        sortOrder: 1,
        localComment: null,
        skipReason: null,
        status: "in_progress",
        startedAt: "2025-01-02T00:00:00.000Z",
        goals: "Цель",
        objectives: "Задачи",
        expectedDurationDays: 7,
        expectedDurationText: "1 неделя",
        groups: [],
        items: [
          {
            id: "item-1",
            stageId: "st-1",
            itemType: "recommendation",
            itemRefId: "r1",
            sortOrder: 0,
            comment: null,
            localComment: null,
            settings: null,
            snapshot: { title: "Рекомендация 1" },
            completedAt: null,
            isActionable: true,
            status: "active",
            groupId: null,
            createdAt: "2025-01-02T00:00:00.000Z",
            lastViewedAt: null,
            effectiveComment: null,
          },
          {
            id: "item-2",
            stageId: "st-1",
            itemType: "exercise",
            itemRefId: "e1",
            sortOrder: 1,
            comment: null,
            localComment: null,
            settings: null,
            snapshot: { title: "Упражнение" },
            completedAt: null,
            isActionable: true,
            status: "active",
            groupId: null,
            createdAt: "2025-01-02T00:00:00.000Z",
            lastViewedAt: "2025-01-03T00:00:00.000Z",
            effectiveComment: null,
          },
        ],
      },
      {
        id: "st-2",
        instanceId: "inst-1",
        sourceStageId: null,
        title: "Этап 2",
        description: null,
        sortOrder: 2,
        localComment: null,
        skipReason: null,
        status: "locked",
        startedAt: null,
        goals: null,
        objectives: null,
        expectedDurationDays: null,
        expectedDurationText: null,
        groups: [],
        items: [],
      },
    ],
    ...over,
  };
}

describe("buildDoctorClientCarePlanOverview", () => {
  it("returns null for non-active instance", () => {
    expect(buildDoctorClientCarePlanOverview(makeDetail({ status: "completed" }))).toBeNull();
  });

  it("picks in_progress stage and marks unviewed items as new", () => {
    const model = buildDoctorClientCarePlanOverview(makeDetail());
    expect(model).not.toBeNull();
    expect(model!.stageTitle).toBe("Этап 1");
    expect(model!.goals).toBe("Цель");
    expect(model!.items).toHaveLength(2);
    expect(model!.items[0]!.isNew).toBe(true);
    expect(model!.items[1]!.isNew).toBe(false);
    expect(model!.totalStages).toBe(2);
  });
});
