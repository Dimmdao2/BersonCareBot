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
          patientPlanUpdatedBadgeForInstance: vi.fn(),
        },
        programItemDiscussion: { listMessagesForStageItem: vi.fn() },
      },
      "p1",
      [],
    );
    expect(data.aggregates.newCommentsCount).toBe(0);
    expect(data.carePlan).toBeNull();
    expect(data.programInbox).toEqual([]);
  });

  it("aggregates patient-last messages and plan-not-opened badge", async () => {
    const data = await loadDoctorClientProgramCardData(
      {
        treatmentProgramInstance: {
          patientPlanUpdatedBadgeForInstance: vi.fn().mockResolvedValue({
            show: true,
            eventIso: "2025-06-01T12:00:00.000Z",
          }),
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
        },
        programItemDiscussion: {
          listMessagesForStageItem: vi.fn(async (id: string) => {
            if (id === "item-a") {
              return [
                {
                  id: "m1",
                  instanceStageItemId: id,
                  patientUserId: "p1",
                  senderRole: "patient" as const,
                  origin: "patient_observation" as const,
                  body: "Вопрос",
                  mediaFileId: null,
                  supportMessageId: null,
                  createdAt: "2025-06-01T10:00:00.000Z",
                },
              ];
            }
            if (id === "item-b") {
              return [
                {
                  id: "m2",
                  instanceStageItemId: id,
                  patientUserId: "p1",
                  senderRole: "patient" as const,
                  origin: "patient_observation" as const,
                  body: null,
                  mediaFileId: "media-1",
                  supportMessageId: null,
                  createdAt: "2025-06-01T11:00:00.000Z",
                },
              ];
            }
            return [];
          }),
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
  });
});
