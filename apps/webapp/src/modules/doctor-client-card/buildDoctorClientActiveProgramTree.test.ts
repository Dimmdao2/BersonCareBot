import { describe, expect, it } from "vitest";
import type { TreatmentProgramInstanceDetail } from "@/modules/treatment-program/types";
import { buildDoctorClientActiveProgramTree } from "./buildDoctorClientActiveProgramTree";

function baseDetail(
  overrides: Partial<TreatmentProgramInstanceDetail> & {
    stages?: TreatmentProgramInstanceDetail["stages"];
  } = {},
): TreatmentProgramInstanceDetail {
  return {
    id: "inst-1",
    title: "План реабилитации",
    status: "active",
    templateId: null,
    patientUserId: "p1",
    assignedBy: null,
    assignmentSource: "doctor",
    patientPlanLastOpenedAt: null,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    stages: [],
    ...overrides,
  };
}

describe("buildDoctorClientActiveProgramTree", () => {
  it("returns null for non-active instance", () => {
    expect(buildDoctorClientActiveProgramTree(baseDetail({ status: "completed" }))).toBeNull();
  });

  it("omits disabled items and orders active items by sortOrder", () => {
    const tree = buildDoctorClientActiveProgramTree(
      baseDetail({
        stages: [
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
            startedAt: null,
            goals: null,
            objectives: null,
            expectedDurationDays: null,
            expectedDurationText: null,
            groups: [],
            items: [
              {
                id: "item-disabled",
                stageId: "st-1",
                itemType: "recommendation",
                itemRefId: "r0",
                sortOrder: 0,
                comment: null,
                localComment: null,
                settings: null,
                snapshot: { title: "Скрытый" },
                completedAt: null,
                isActionable: true,
                status: "disabled",
                groupId: null,
                createdAt: "2025-01-01T00:00:00.000Z",
                lastViewedAt: null,
                effectiveComment: null,
              },
              {
                id: "item-b",
                stageId: "st-1",
                itemType: "recommendation",
                itemRefId: "r2",
                sortOrder: 2,
                comment: null,
                localComment: null,
                settings: null,
                snapshot: { title: "Б" },
                completedAt: null,
                isActionable: true,
                status: "active",
                groupId: null,
                createdAt: "2025-01-01T00:00:00.000Z",
                lastViewedAt: null,
                effectiveComment: null,
              },
              {
                id: "item-a",
                stageId: "st-1",
                itemType: "recommendation",
                itemRefId: "r1",
                sortOrder: 1,
                comment: null,
                localComment: null,
                settings: null,
                snapshot: { title: "А" },
                completedAt: null,
                isActionable: true,
                status: "active",
                groupId: null,
                createdAt: "2025-01-01T00:00:00.000Z",
                lastViewedAt: "2025-01-02T00:00:00.000Z",
                effectiveComment: null,
              },
            ],
          },
        ],
      }),
    );

    expect(tree?.defaultExpandedStageId).toBe("st-1");
    expect(tree?.stages).toHaveLength(1);
    expect(tree?.stages[0]?.ungroupedItems.map((i) => i.title)).toEqual(["А", "Б"]);
    expect(tree?.stages[0]?.ungroupedItems[0]?.isNew).toBe(false);
    expect(tree?.stages[0]?.ungroupedItems[1]?.isNew).toBe(true);
  });

  it("includes stage zero as separate block when it has active items", () => {
    const tree = buildDoctorClientActiveProgramTree(
      baseDetail({
        stages: [
          {
            id: "st-0",
            instanceId: "inst-1",
            sourceStageId: null,
            title: "",
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
            items: [
              {
                id: "item-z",
                stageId: "st-0",
                itemType: "recommendation",
                itemRefId: "rz",
                sortOrder: 0,
                comment: null,
                localComment: null,
                settings: null,
                snapshot: { title: "Общая" },
                completedAt: null,
                isActionable: true,
                status: "active",
                groupId: null,
                createdAt: "2025-01-01T00:00:00.000Z",
                lastViewedAt: null,
                effectiveComment: null,
              },
            ],
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
            startedAt: null,
            goals: null,
            objectives: null,
            expectedDurationDays: null,
            expectedDurationText: null,
            groups: [],
            items: [
              {
                id: "item-p",
                stageId: "st-1",
                itemType: "recommendation",
                itemRefId: "rp",
                sortOrder: 0,
                comment: null,
                localComment: null,
                settings: null,
                snapshot: { title: "Пункт" },
                completedAt: null,
                isActionable: true,
                status: "active",
                groupId: null,
                createdAt: "2025-01-01T00:00:00.000Z",
                lastViewedAt: null,
                effectiveComment: null,
              },
            ],
          },
        ],
      }),
    );

    expect(tree?.stages.map((s) => s.id)).toEqual(["st-0", "st-1"]);
    expect(tree?.stages[0]?.title).toBe("Общие рекомендации");
  });
});
