import { describe, expect, it } from "vitest";
import {
  createEmptyInstanceEditorDraft,
  createInstanceEditorDraftClientId,
  hasInstanceEditorDraftFlushableChanges,
  hasInstanceEditorDraftStructuralChanges,
  isInstanceEditorDraftDirty,
  isInstanceEditorDraftEmpty,
  isInstanceEditorDraftFlushEmpty,
  mergeInstanceEditorDraftIntoDetail,
  mergeInstanceEditorDraftIntoDetailRaw,
  normalizeInstanceEditorDraft,
  pickInstanceEditorDraftFlushChanges,
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
            title: "Группа A",
            description: null,
            scheduleText: null,
            sortOrder: 0,
            systemKind: null,
            sourceGroupId: null,
          },
          {
            id: "66666666-6666-4666-8666-666666666666",
            stageId: "22222222-2222-4222-8222-222222222222",
            title: "Группа B",
            description: null,
            scheduleText: null,
            sortOrder: 1,
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
            snapshot: { title: "Упр 1" },
            completedAt: null,
            isActionable: null,
            status: "active" as const,
            groupId: "33333333-3333-4333-8333-333333333333",
            createdAt: "2026-01-01T00:00:00.000Z",
            lastViewedAt: null,
            effectiveComment: null,
          },
          {
            id: "77777777-7777-4777-8777-777777777777",
            stageId: "22222222-2222-4222-8222-222222222222",
            itemType: "exercise" as const,
            itemRefId: "88888888-8888-4888-8888-888888888888",
            sortOrder: 1,
            comment: null,
            localComment: null,
            settings: null,
            snapshot: { title: "Упр 2" },
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

  it("merge applies stageOrder, creates, deletes, reorders and structural patches", () => {
    const baseline = minimalDetail();
    const draft = createEmptyInstanceEditorDraft();
    const newStageId = createInstanceEditorDraftClientId();
    const newGroupId = createInstanceEditorDraftClientId();
    const newItemId = createInstanceEditorDraftClientId();

    draft.stageCreates.push({ clientId: newStageId, title: "Новый этап" });
    draft.groupCreates.push({
      clientId: newGroupId,
      stageId: "22222222-2222-4222-8222-222222222222",
      title: "Новая группа",
    });
    draft.itemCreates.push({
      kind: "library_item",
      clientId: newItemId,
      stageId: "22222222-2222-4222-8222-222222222222",
      itemType: "recommendation",
      itemRefId: "99999999-9999-4999-8999-999999999999",
      groupId: newGroupId,
      snapshot: { title: "Рек" },
    });
    draft.itemDeletes["77777777-7777-4777-8777-777777777777"] = true;
    draft.itemReorders["22222222-2222-4222-8222-222222222222"] = [
      "77777777-7777-4777-8777-777777777777",
      "44444444-4444-4444-8444-444444444444",
      newItemId,
    ];
    draft.groupReorders["22222222-2222-4222-8222-222222222222"] = [
      "66666666-6666-4666-8666-666666666666",
      "33333333-3333-4333-8333-333333333333",
      newGroupId,
    ];
    draft.itemStructuralPatches["44444444-4444-4444-8444-444444444444"] = {
      groupId: "66666666-6666-4666-8666-666666666666",
      isActionable: false,
      status: "disabled",
    };
    draft.stageOrder = [
      "22222222-2222-4222-8222-222222222222",
      newStageId,
    ];

    const merged = mergeInstanceEditorDraftIntoDetail(baseline, draft);
    expect(merged.stages.map((s) => s.id)).toEqual([
      "22222222-2222-4222-8222-222222222222",
      newStageId,
    ]);
    expect(merged.stages[0]?.groups.map((g) => g.id)).toEqual([
      "66666666-6666-4666-8666-666666666666",
      "33333333-3333-4333-8333-333333333333",
      newGroupId,
    ]);
    const stageItems = merged.stages[0]?.items ?? [];
    expect(stageItems.map((i) => i.id)).toEqual([
      "44444444-4444-4444-8444-444444444444",
      newItemId,
    ]);
    expect(stageItems[0]?.groupId).toBe("66666666-6666-4666-8666-666666666666");
    expect(stageItems[0]?.isActionable).toBe(false);
    expect(stageItems[0]?.status).toBe("disabled");
    expect(merged.stages[1]?.title).toBe("Новый этап");
  });

  it("normalize drops no-op stageOrder and reorders", () => {
    const baseline = minimalDetail();
    const draft = createEmptyInstanceEditorDraft();
    draft.stageOrder = ["22222222-2222-4222-8222-222222222222"];
    draft.groupReorders["22222222-2222-4222-8222-222222222222"] = [
      "33333333-3333-4333-8333-333333333333",
      "66666666-6666-4666-8666-666666666666",
    ];
    draft.itemReorders["22222222-2222-4222-8222-222222222222"] = [
      "44444444-4444-4444-8444-444444444444",
      "77777777-7777-4777-8777-777777777777",
    ];

    const normalized = normalizeInstanceEditorDraft(draft, baseline);
    expect(normalized.stageOrder).toBeNull();
    expect(normalized.groupReorders).toEqual({});
    expect(normalized.itemReorders).toEqual({});
    expect(isInstanceEditorDraftDirty(draft, baseline)).toBe(false);
  });

  it("normalize drops itemReorders after delete removes reordered item", () => {
    const baseline = minimalDetail();
    const stageId = "22222222-2222-4222-8222-222222222222";
    const itemA = "44444444-4444-4444-8444-444444444444";
    const itemB = "77777777-7777-4777-8777-777777777777";
    const draft = createEmptyInstanceEditorDraft();
    draft.itemReorders[stageId] = [itemB, itemA];
    draft.itemDeletes[itemB] = true;

    const normalized = normalizeInstanceEditorDraft(draft, baseline);
    expect(normalized.itemReorders).toEqual({});
    expect(isInstanceEditorDraftDirty(draft, baseline)).toBe(true);
    expect(normalized.itemDeletes).toEqual({ [itemB]: true });
  });

  it("normalize keeps itemReorders when delete leaves a different order", () => {
    const baseline = minimalDetail();
    const stageId = "22222222-2222-4222-8222-222222222222";
    const itemA = "44444444-4444-4444-8444-444444444444";
    const itemB = "77777777-7777-4777-8777-777777777777";
    const draft = createEmptyInstanceEditorDraft();
    draft.itemReorders[stageId] = [itemB, itemA];

    const normalized = normalizeInstanceEditorDraft(draft, baseline);
    expect(normalized.itemReorders[stageId]).toEqual([itemB, itemA]);
  });

  it("normalize appends newly created item to existing itemReorders", () => {
    const baseline = minimalDetail();
    const stageId = "22222222-2222-4222-8222-222222222222";
    const itemA = "44444444-4444-4444-8444-444444444444";
    const itemB = "77777777-7777-4777-8777-777777777777";
    const newItemId = createInstanceEditorDraftClientId();
    const draft = createEmptyInstanceEditorDraft();
    draft.itemReorders[stageId] = [itemB, itemA];
    draft.itemCreates.push({
      kind: "library_item",
      clientId: newItemId,
      stageId,
      itemType: "recommendation",
      itemRefId: "99999999-9999-4999-8999-999999999999",
      snapshot: { title: "Новая рекомендация" },
    });

    const normalized = normalizeInstanceEditorDraft(draft, baseline);
    expect(normalized.itemReorders[stageId]).toEqual([itemB, itemA, newItemId]);
  });

  it("normalize appends newly created stage to existing stageOrder", () => {
    const baseline = minimalDetail();
    baseline.stages.push({
      ...baseline.stages[0]!,
      id: "99999999-9999-4999-8999-999999999999",
      title: "Этап 2",
      sortOrder: 2,
      groups: [],
      items: [],
    });
    const firstStageId = baseline.stages[0]!.id;
    const secondStageId = baseline.stages[1]!.id;
    const thirdStageId = createInstanceEditorDraftClientId();
    const draft = createEmptyInstanceEditorDraft();
    draft.stageOrder = [secondStageId, firstStageId];
    draft.stageCreates.push({ clientId: thirdStageId, title: "Этап 3" });

    const normalized = normalizeInstanceEditorDraft(draft, baseline);
    expect(normalized.stageOrder).toEqual([secondStageId, firstStageId, thirdStageId]);
  });

  it("normalize keeps stageOrder when order changes", () => {
    const baseline = minimalDetail();
    const secondStageId = createInstanceEditorDraftClientId();
    const draft = createEmptyInstanceEditorDraft();
    draft.stageCreates.push({ clientId: secondStageId, title: "Этап 2" });
    draft.stageOrder = [secondStageId, "22222222-2222-4222-8222-222222222222"];

    expect(isInstanceEditorDraftDirty(draft, baseline)).toBe(true);
    const normalized = normalizeInstanceEditorDraft(draft, baseline);
    expect(normalized.stageOrder).toEqual(draft.stageOrder);
    expect(normalized.stageCreates).toHaveLength(1);

    const merged = mergeInstanceEditorDraftIntoDetailRaw(baseline, normalized);
    expect(merged.stages.map((s) => s.id)).toEqual([
      secondStageId,
      "22222222-2222-4222-8222-222222222222",
    ]);
  });

  it("normalize drops structural patch matching effective item", () => {
    const baseline = minimalDetail();
    const draft = createEmptyInstanceEditorDraft();
    draft.itemStructuralPatches["44444444-4444-4444-8444-444444444444"] = {
      groupId: "33333333-3333-4333-8333-333333333333",
    };

    expect(normalizeInstanceEditorDraft(draft, baseline).itemStructuralPatches).toEqual({});
  });

  it("normalize removes itemDeletes for unknown ids and draft-only creates", () => {
    const baseline = minimalDetail();
    const draftItemId = createInstanceEditorDraftClientId();
    const draft = createEmptyInstanceEditorDraft();
    draft.itemDeletes["00000000-0000-4000-8000-000000000000"] = true;
    draft.itemCreates.push({
      kind: "library_item",
      clientId: draftItemId,
      stageId: "22222222-2222-4222-8222-222222222222",
      itemType: "recommendation",
      itemRefId: "99999999-9999-4999-8999-999999999999",
      snapshot: { title: "X" },
    });
    draft.itemDeletes[draftItemId] = true;

    const normalized = normalizeInstanceEditorDraft(draft, baseline);
    expect(normalized.itemDeletes).toEqual({});
    expect(normalized.itemCreates).toEqual([]);
    expect(isInstanceEditorDraftDirty(draft, baseline)).toBe(false);
  });

  it("merge applies item replace structural patch", () => {
    const baseline = minimalDetail();
    const draft = createEmptyInstanceEditorDraft();
    draft.itemStructuralPatches["44444444-4444-4444-8444-444444444444"] = {
      replace: {
        itemType: "recommendation",
        itemRefId: "99999999-9999-4999-8999-999999999999",
        snapshot: { title: "Новая рек" },
      },
    };

    const merged = mergeInstanceEditorDraftIntoDetail(baseline, draft);
    const item = merged.stages[0]?.items[0];
    expect(item?.itemType).toBe("recommendation");
    expect(item?.itemRefId).toBe("99999999-9999-4999-8999-999999999999");
    expect(item?.snapshot).toEqual({ title: "Новая рек" });
  });

  it("group reorder keeps system groups at fixed positions", () => {
    const baseline = minimalDetail();
    baseline.stages[0]!.groups = [
      {
        id: "rec-group",
        stageId: baseline.stages[0]!.id,
        title: "Рекомендации",
        description: null,
        scheduleText: null,
        sortOrder: 0,
        systemKind: "recommendations",
        sourceGroupId: null,
      },
      ...baseline.stages[0]!.groups,
      {
        id: "tests-group",
        stageId: baseline.stages[0]!.id,
        title: "Тестирование",
        description: null,
        scheduleText: null,
        sortOrder: 99,
        systemKind: "tests",
        sourceGroupId: null,
      },
    ];

    const draft = createEmptyInstanceEditorDraft();
    draft.groupReorders[baseline.stages[0]!.id] = [
      "66666666-6666-4666-8666-666666666666",
      "33333333-3333-4333-8333-333333333333",
    ];

    const merged = mergeInstanceEditorDraftIntoDetail(baseline, draft);
    expect(merged.stages[0]?.groups.map((g) => g.id)).toEqual([
      "rec-group",
      "66666666-6666-4666-8666-666666666666",
      "33333333-3333-4333-8333-333333333333",
      "tests-group",
    ]);
  });

  it("pickInstanceEditorDraftFlushChanges ignores structural sections", () => {
    const baseline = minimalDetail();
    const draft = createEmptyInstanceEditorDraft();
    draft.stageCreates.push({
      clientId: createInstanceEditorDraftClientId(),
      title: "Этап 2",
    });
    draft.itemStructuralPatches["44444444-4444-4444-8444-444444444444"] = { status: "disabled" };

    expect(isInstanceEditorDraftFlushEmpty(pickInstanceEditorDraftFlushChanges(draft, baseline))).toBe(true);
    expect(hasInstanceEditorDraftStructuralChanges(draft, baseline)).toBe(true);
    expect(isInstanceEditorDraftDirty(draft, baseline)).toBe(true);
  });

  it("hasInstanceEditorDraftFlushableChanges is false for structural-only draft", () => {
    const baseline = minimalDetail();
    const draft = createEmptyInstanceEditorDraft();
    draft.stageCreates.push({
      clientId: createInstanceEditorDraftClientId(),
      title: "Этап 2",
    });

    expect(hasInstanceEditorDraftFlushableChanges(draft, baseline)).toBe(false);
    expect(hasInstanceEditorDraftStructuralChanges(draft, baseline)).toBe(true);
    expect(isInstanceEditorDraftDirty(draft, baseline)).toBe(true);
  });

  it("normalize keeps patches on draft-created group and item", () => {
    const baseline = minimalDetail();
    const groupId = createInstanceEditorDraftClientId();
    const itemId = createInstanceEditorDraftClientId();
    const draft = createEmptyInstanceEditorDraft();
    draft.groupCreates.push({
      clientId: groupId,
      stageId: "22222222-2222-4222-8222-222222222222",
      title: "Draft group",
    });
    draft.itemCreates.push({
      kind: "library_item",
      clientId: itemId,
      stageId: "22222222-2222-4222-8222-222222222222",
      itemType: "recommendation",
      itemRefId: "99999999-9999-4999-8999-999999999999",
      groupId,
      snapshot: { title: "Draft item" },
    });
    draft.groupPatches[groupId] = { title: "Renamed draft group" };
    draft.itemPatches[itemId] = { localComment: "Draft comment" };

    const normalized = normalizeInstanceEditorDraft(draft, baseline);
    expect(normalized.groupPatches[groupId]).toEqual({ title: "Renamed draft group" });
    expect(normalized.itemPatches[itemId]).toEqual({ localComment: "Draft comment" });
  });

  it("stageOrder keeps stage zero first", () => {
    const baseline = minimalDetail();
    const stageZeroId = "00000000-0000-4000-8000-000000000001";
    const pipelineId = baseline.stages[0]!.id;
    baseline.stages.unshift({
      ...baseline.stages[0]!,
      id: stageZeroId,
      title: "Общие",
      sortOrder: 0,
      groups: [],
      items: [],
    });

    const draft = createEmptyInstanceEditorDraft();
    draft.stageOrder = [pipelineId, stageZeroId];

    const merged = mergeInstanceEditorDraftIntoDetail(baseline, draft);
    expect(merged.stages[0]?.id).toBe(stageZeroId);
    expect(merged.stages[0]?.sortOrder).toBe(0);
    expect(merged.stages[1]?.id).toBe(pipelineId);
  });

  it("groupHides removes group and disables its items in preview", () => {
    const baseline = minimalDetail();
    const draft = createEmptyInstanceEditorDraft();
    draft.groupHides["33333333-3333-4333-8333-333333333333"] = true;

    const merged = mergeInstanceEditorDraftIntoDetail(baseline, draft);
    expect(merged.stages[0]?.groups.some((g) => g.id === "33333333-3333-4333-8333-333333333333")).toBe(
      false,
    );
    expect(merged.stages[0]?.items.every((i) => i.status === "disabled")).toBe(true);
  });

  it("materializes test_set_expand and lfk_complex_expand item creates", () => {
    const baseline = minimalDetail();
    const draft = createEmptyInstanceEditorDraft();
    draft.itemCreates.push({
      kind: "test_set_expand",
      stageId: "22222222-2222-4222-8222-222222222222",
      testSetId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      items: [
        {
          clientId: createInstanceEditorDraftClientId(),
          itemRefId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          snapshot: { title: "Тест 1" },
        },
      ],
    });
    draft.itemCreates.push({
      kind: "lfk_complex_expand",
      stageId: "22222222-2222-4222-8222-222222222222",
      groupId: "33333333-3333-4333-8333-333333333333",
      complexTemplateId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      items: [
        {
          clientId: createInstanceEditorDraftClientId(),
          itemRefId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          snapshot: { title: "Упр A" },
        },
      ],
    });

    const merged = mergeInstanceEditorDraftIntoDetail(baseline, draft);
    const types = merged.stages[0]?.items.map((i) => i.itemType);
    expect(types).toContain("clinical_test");
    expect(types).toContain("exercise");
  });
});
