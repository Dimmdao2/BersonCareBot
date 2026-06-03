import { describe, expect, it, vi } from "vitest";
import type { TreatmentProgramInstanceSummary } from "@/modules/treatment-program/types";
import { loadDoctorClientProgramCardData } from "./loadDoctorClientProgramCardAggregates";

const activeInstance: TreatmentProgramInstanceSummary = {
  id: "inst-1",
  title: "План",
  status: "active",
  templateId: null,
  patientUserId: "p1",
  assignedBy: null,
  assignmentSource: "doctor",
  patientPlanLastOpenedAt: null,
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
};

describe("loadDoctorClientProgramCardData", () => {
  it("returns empty when no active instance", async () => {
    const data = await loadDoctorClientProgramCardData(
      {
        treatmentProgramInstance: {
          getInstanceById: vi.fn(),
          listProgramEvents: vi.fn().mockResolvedValue([]),
          patientPlanUpdatedBadgeForInstance: vi.fn(),
        },
        programItemDiscussion: { listAttentionSummaryForStageItems: vi.fn() },
      },
      "p1",
      [],
    );
    expect(data.aggregates.newCommentsCount).toBe(0);
    expect(data.carePlan).toBeNull();
    expect(data.programInbox).toEqual([]);
  });

  it("aggregates patient-last messages and plan-not-opened badge", async () => {
    const listAttentionSummaryForStageItems = vi.fn(async (ids: string[]) =>
      ids.map((id) =>
        id === "item-a"
          ? { stageItemId: id, comments: 1, media: 0 }
          : id === "item-b"
            ? { stageItemId: id, comments: 0, media: 1 }
            : { stageItemId: id, comments: 0, media: 0 },
      ),
    );
    const data = await loadDoctorClientProgramCardData(
      {
        treatmentProgramInstance: {
          getInstanceById: vi.fn().mockResolvedValue({
            id: "inst-1",
            title: "План",
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
                id: "st-1",
                instanceId: "inst-1",
                sourceStageId: null,
                title: "Этап",
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
                    id: "item-a",
                    stageId: "st-1",
                    itemType: "recommendation",
                    itemRefId: "r1",
                    sortOrder: 0,
                    comment: null,
                    localComment: null,
                    settings: null,
                    snapshot: { title: "А" },
                    completedAt: null,
                    isActionable: true,
                    status: "active",
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
                    sortOrder: 1,
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
                ],
              },
            ],
          }),
          listProgramEvents: vi.fn().mockResolvedValue([]),
          patientPlanUpdatedBadgeForInstance: vi.fn().mockResolvedValue({
            show: true,
            eventIso: "2025-06-01T12:00:00.000Z",
          }),
        },
        programItemDiscussion: {
          listAttentionSummaryForStageItems,
        },
      },
      "p1",
      [activeInstance],
    );

    expect(data.aggregates).toMatchObject({
      newCommentsCount: 1,
      patientMediaCount: 1,
      planNotOpened: true,
      lastPlanMutationEventAt: "2025-06-01T12:00:00.000Z",
    });
    expect(data.programInbox).toHaveLength(2);
    expect(data.carePlan?.instanceId).toBe("inst-1");
    expect(data.activeProgramTree?.instanceId).toBe("inst-1");
    expect(data.activeProgramTree?.stages[0]?.ungroupedItems).toHaveLength(2);
    expect(listAttentionSummaryForStageItems).toHaveBeenCalledTimes(1);
    expect(listAttentionSummaryForStageItems).toHaveBeenCalledWith(["item-a", "item-b"]);
  });
});
