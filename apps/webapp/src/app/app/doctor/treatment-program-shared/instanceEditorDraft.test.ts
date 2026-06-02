import { describe, expect, it } from "vitest";
import {
  createEmptyInstanceEditorDraft,
  isInstanceEditorDraftDirty,
  isInstanceEditorDraftEmpty,
  mergeInstanceEditorDraftIntoDetail,
  normalizeInstanceEditorDraft,
} from "./instanceEditorDraft";
import type { TreatmentProgramInstanceDetail } from "@/modules/treatment-program/types";

function minimalDetail(): TreatmentProgramInstanceDetail {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    patientUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    templateId: null,
    title: "План",
    status: "active",
    assignmentSource: "doctor",
    assignedBy: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    patientPlanLastOpenedAt: null,
    stages: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        instanceId: "11111111-1111-4111-8111-111111111111",
        sourceStageId: null,
        title: "Этап 1",
        description: null,
        sortOrder: 1,
        status: "available",
        skipReason: null,
        localComment: null,
        startedAt: null,
        goals: null,
        objectives: null,
        expectedDurationDays: null,
        expectedDurationText: null,
        groups: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            stageId: "22222222-2222-4222-8222-222222222222",
            title: "Группа",
            description: null,
            scheduleText: null,
            sortOrder: 0,
            systemKind: null,
            sourceGroupId: null,
          },
        ],
        items: [
          {
            id: "44444444-4444-4444-8444-444444444444",
            stageId: "22222222-2222-4222-8222-222222222222",
            itemType: "exercise" as const,
            itemRefId: "55555555-5555-4555-8555-555555555555",
            sortOrder: 0,
            comment: null,
            localComment: null,
            settings: null,
            snapshot: { title: "Упр" },
            completedAt: null,
            isActionable: null,
            status: "active" as const,
            groupId: "33333333-3333-4333-8333-333333333333",
            createdAt: "2026-01-01T00:00:00.000Z",
            lastViewedAt: null,
            effectiveComment: null,
          },
        ],
      },
    ],
  };
}

describe("instanceEditorDraft", () => {
  it("merge applies stage, group and item patches", () => {
    const draft = createEmptyInstanceEditorDraft();
    draft.stageMetadata["22222222-2222-4222-8222-222222222222"] = { title: "Новый этап" };
    draft.groupPatches["33333333-3333-4333-8333-333333333333"] = { title: "Новая группа" };
    draft.itemPatches["44444444-4444-4444-8444-444444444444"] = {
      localComment: "Коммент",
      loadSettings: { reps: 10, sets: 3, maxPain: 5 },
    };

    const merged = mergeInstanceEditorDraftIntoDetail(minimalDetail(), draft);
    expect(merged.stages[0]?.title).toBe("Новый этап");
    expect(merged.stages[0]?.groups[0]?.title).toBe("Новая группа");
    expect(merged.stages[0]?.items[0]?.localComment).toBe("Коммент");
    expect(merged.stages[0]?.items[0]?.settings).toMatchObject({ reps: 10, sets: 3, maxPain: 5 });
    expect(isInstanceEditorDraftEmpty(createEmptyInstanceEditorDraft())).toBe(true);
  });

  it("normalize drops no-op patches (false dirty on blur)", () => {
    const baseline = minimalDetail();
    const draft = createEmptyInstanceEditorDraft();
    draft.stageMetadata["22222222-2222-4222-8222-222222222222"] = { title: "Этап 1" };
    draft.itemPatches["44444444-4444-4444-8444-444444444444"] = { localComment: null };

    const normalized = normalizeInstanceEditorDraft(draft, baseline);
    expect(normalized).toEqual(createEmptyInstanceEditorDraft());
    expect(isInstanceEditorDraftDirty(draft, baseline)).toBe(false);
    expect(mergeInstanceEditorDraftIntoDetail(baseline, draft)).toBe(baseline);
  });

  it("normalize keeps real changes", () => {
    const baseline = minimalDetail();
    const draft = createEmptyInstanceEditorDraft();
    draft.itemPatches["44444444-4444-4444-8444-444444444444"] = { localComment: "Новый" };

    expect(isInstanceEditorDraftDirty(draft, baseline)).toBe(true);
    expect(normalizeInstanceEditorDraft(draft, baseline).itemPatches).toEqual(draft.itemPatches);
  });
});
