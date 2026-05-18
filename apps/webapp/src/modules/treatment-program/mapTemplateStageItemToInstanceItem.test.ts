import { describe, expect, it } from "vitest";
import { mapTemplateStageItemToInstanceStageItemId } from "./mapTemplateStageItemToInstanceItem";
import type { TreatmentProgramInstanceDetail, TreatmentProgramTemplateDetail } from "./types";

describe("mapTemplateStageItemToInstanceStageItemId", () => {
  it("maps by stage + group + item fields", () => {
    const template = {
      id: "tpl",
      title: "T",
      description: null,
      status: "published" as const,
      stageCount: 1,
      itemCount: 1,
      listPreviewMedia: null,
      createdBy: null,
      createdAt: "",
      updatedAt: "",
      stages: [
        {
          id: "st1",
          templateId: "tpl",
          title: "S1",
          description: null,
          sortOrder: 1,
          goals: null,
          objectives: null,
          expectedDurationDays: null,
          expectedDurationText: null,
          groups: [
            {
              id: "tg1",
              stageId: "st1",
              title: "G",
              description: null,
              scheduleText: null,
              sortOrder: 0,
              systemKind: null,
            },
          ],
          items: [
            {
              id: "ti1",
              stageId: "st1",
              itemType: "exercise" as const,
              itemRefId: "ex1",
              sortOrder: 0,
              comment: null,
              settings: null,
              groupId: "tg1",
            },
          ],
        },
      ],
    } satisfies TreatmentProgramTemplateDetail;

    const instance = {
      id: "inst",
      patientUserId: "p1",
      templateId: "tpl",
      assignedBy: null,
      assignmentSource: "promo" as const,
      title: "I",
      status: "active" as const,
      createdAt: "",
      updatedAt: "",
      patientPlanLastOpenedAt: null,
      stages: [
        {
          id: "is1",
          instanceId: "inst",
          sourceStageId: "st1",
          title: "S1",
          description: null,
          sortOrder: 1,
          localComment: null,
          skipReason: null,
          status: "available" as const,
          startedAt: null,
          goals: null,
          objectives: null,
          expectedDurationDays: null,
          expectedDurationText: null,
          groups: [
            {
              id: "ig1",
              stageId: "is1",
              sourceGroupId: "tg1",
              title: "G",
              description: null,
              scheduleText: null,
              sortOrder: 0,
              systemKind: null,
            },
          ],
          items: [
            {
              id: "ii1",
              stageId: "is1",
              itemType: "exercise" as const,
              itemRefId: "ex1",
              sortOrder: 0,
              comment: null,
              localComment: null,
              settings: null,
              snapshot: {},
              completedAt: null,
              isActionable: true,
              status: "active" as const,
              groupId: "ig1",
              createdAt: "",
              lastViewedAt: null,
              effectiveComment: null,
            },
          ],
        },
      ],
    } satisfies TreatmentProgramInstanceDetail;

    expect(mapTemplateStageItemToInstanceStageItemId(template, instance, "ti1")).toBe("ii1");
  });

  it("returns null for unknown template item id", () => {
    const template = {
      id: "tpl",
      title: "T",
      description: null,
      status: "published" as const,
      stageCount: 0,
      itemCount: 0,
      listPreviewMedia: null,
      createdBy: null,
      createdAt: "",
      updatedAt: "",
      stages: [],
    } satisfies TreatmentProgramTemplateDetail;

    const instance = {
      id: "inst",
      patientUserId: "p1",
      templateId: "tpl",
      assignedBy: null,
      assignmentSource: "promo" as const,
      title: "I",
      status: "active" as const,
      createdAt: "",
      updatedAt: "",
      patientPlanLastOpenedAt: null,
      stages: [],
    } satisfies TreatmentProgramInstanceDetail;

    expect(mapTemplateStageItemToInstanceStageItemId(template, instance, "nope")).toBeNull();
  });
});
