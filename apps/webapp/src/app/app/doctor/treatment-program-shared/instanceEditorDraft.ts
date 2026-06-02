import type {
  TreatmentProgramInstanceDetail,
  TreatmentProgramInstanceStageGroup,
  TreatmentProgramInstanceStageItemRow,
  TreatmentProgramInstanceStageItemStatus,
  TreatmentProgramInstanceStageItemView,
  TreatmentProgramItemType,
} from "@/modules/treatment-program/types";
import { effectiveInstanceStageItemComment } from "@/modules/treatment-program/types";
import { sortByOrderThenId } from "./treatmentProgramReorderHelpers";

export const INSTANCE_EDITOR_DRAFT_ID_PREFIX = "draft:";

export function isInstanceEditorDraftClientId(id: string): boolean {
  return id.startsWith(INSTANCE_EDITOR_DRAFT_ID_PREFIX);
}

export function createInstanceEditorDraftClientId(): string {
  return `${INSTANCE_EDITOR_DRAFT_ID_PREFIX}${crypto.randomUUID()}`;
}

export type InstanceEditorStageMetadataPatch = {
  title?: string;
  description?: string | null;
  goals?: string | null;
  objectives?: string | null;
  expectedDurationDays?: number | null;
  expectedDurationText?: string | null;
};

export type InstanceEditorGroupPatch = {
  title?: string;
  description?: string | null;
  scheduleText?: string | null;
};

export type InstanceEditorItemLoadSettingsPatch = {
  reps: number | null;
  sets: number | null;
  maxPain: number | null;
};

export type InstanceEditorItemPatch = {
  localComment?: string | null;
  loadSettings?: InstanceEditorItemLoadSettingsPatch;
};

export type InstanceEditorStageCreate = {
  clientId: string;
  title: string;
  description?: string | null;
  goals?: string | null;
  objectives?: string | null;
  expectedDurationDays?: number | null;
  expectedDurationText?: string | null;
};

export type InstanceEditorGroupCreate = {
  clientId: string;
  stageId: string;
  title: string;
  description?: string | null;
  scheduleText?: string | null;
};

export type InstanceEditorItemCreateLibraryItem = {
  kind: "library_item";
  clientId: string;
  stageId: string;
  itemType: TreatmentProgramItemType;
  itemRefId: string;
  groupId?: string | null;
  snapshot: Record<string, unknown>;
  localComment?: string | null;
  isActionable?: boolean | null;
};

export type InstanceEditorItemCreateFreeformRecommendation = {
  kind: "freeform_recommendation";
  clientId: string;
  stageId: string;
  title: string;
  bodyMd: string;
  snapshot: Record<string, unknown>;
};

export type InstanceEditorItemCreateTestSetExpand = {
  kind: "test_set_expand";
  stageId: string;
  testSetId: string;
  items: Array<{
    clientId: string;
    itemRefId: string;
    snapshot: Record<string, unknown>;
  }>;
};

export type InstanceEditorItemCreateLfkComplexExpand = {
  kind: "lfk_complex_expand";
  stageId: string;
  groupId: string;
  complexTemplateId: string;
  items: Array<{
    clientId: string;
    itemRefId: string;
    snapshot: Record<string, unknown>;
  }>;
};

export type InstanceEditorItemCreate =
  | InstanceEditorItemCreateLibraryItem
  | InstanceEditorItemCreateFreeformRecommendation
  | InstanceEditorItemCreateTestSetExpand
  | InstanceEditorItemCreateLfkComplexExpand;

export type InstanceEditorItemCreateInput =
  | (Omit<InstanceEditorItemCreateLibraryItem, "clientId" | "kind"> & {
      kind?: "library_item";
      clientId?: string;
    })
  | (Omit<InstanceEditorItemCreateFreeformRecommendation, "clientId" | "kind"> & {
      kind: "freeform_recommendation";
      clientId?: string;
    })
  | {
      kind: "test_set_expand";
      stageId: string;
      testSetId: string;
      items: Array<{
        clientId?: string;
        itemRefId: string;
        snapshot: Record<string, unknown>;
      }>;
    }
  | {
      kind: "lfk_complex_expand";
      stageId: string;
      groupId: string;
      complexTemplateId: string;
      items: Array<{
        clientId?: string;
        itemRefId: string;
        snapshot: Record<string, unknown>;
      }>;
    };

/** Все client-id строк, которые материализует одна запись itemCreates. */
export function itemCreateClientIds(create: InstanceEditorItemCreate): string[] {
  switch (create.kind) {
    case "library_item":
    case "freeform_recommendation":
      return [create.clientId];
    case "test_set_expand":
    case "lfk_complex_expand":
      return create.items.map((i) => i.clientId);
  }
}

export function prepareInstanceEditorItemCreate(input: InstanceEditorItemCreateInput): InstanceEditorItemCreate {
  if (input.kind === "test_set_expand") {
    return {
      kind: "test_set_expand",
      stageId: input.stageId,
      testSetId: input.testSetId,
      items: input.items.map((item) => ({
        ...item,
        clientId: item.clientId ?? createInstanceEditorDraftClientId(),
      })),
    };
  }
  if (input.kind === "lfk_complex_expand") {
    return {
      kind: "lfk_complex_expand",
      stageId: input.stageId,
      groupId: input.groupId,
      complexTemplateId: input.complexTemplateId,
      items: input.items.map((item) => ({
        ...item,
        clientId: item.clientId ?? createInstanceEditorDraftClientId(),
      })),
    };
  }
  if (input.kind === "freeform_recommendation") {
    return {
      kind: "freeform_recommendation",
      clientId: input.clientId ?? createInstanceEditorDraftClientId(),
      stageId: input.stageId,
      title: input.title,
      bodyMd: input.bodyMd,
      snapshot: input.snapshot,
    };
  }
  return {
    kind: "library_item",
    clientId: input.clientId ?? createInstanceEditorDraftClientId(),
    stageId: input.stageId,
    itemType: input.itemType,
    itemRefId: input.itemRefId,
    groupId: input.groupId,
    snapshot: input.snapshot,
    localComment: input.localComment,
    isActionable: input.isActionable,
  };
}

export function removeItemFromInstanceEditorItemCreates(
  creates: InstanceEditorItemCreate[],
  itemId: string,
): InstanceEditorItemCreate[] {
  return creates.flatMap((create): InstanceEditorItemCreate[] => {
    if (create.kind === "library_item" || create.kind === "freeform_recommendation") {
      return create.clientId === itemId ? [] : [create];
    }
    const nextItems = create.items.filter((item) => item.clientId !== itemId);
    if (nextItems.length === 0) return [];
    if (nextItems.length === create.items.length) return [create];
    return [{ ...create, items: nextItems }];
  });
}

export type InstanceEditorItemStructuralPatch = {
  groupId?: string | null;
  isActionable?: boolean | null;
  status?: TreatmentProgramInstanceStageItemStatus;
  replace?: {
    itemType: TreatmentProgramItemType;
    itemRefId: string;
    snapshot: Record<string, unknown>;
  };
};

export type InstanceEditorDraft = {
  stageMetadata: Record<string, InstanceEditorStageMetadataPatch>;
  groupPatches: Record<string, InstanceEditorGroupPatch>;
  itemPatches: Record<string, InstanceEditorItemPatch>;
  /** Полный порядок id этапов (этап 0 остаётся первым). `null` — без изменений. */
  stageOrder: string[] | null;
  stageCreates: InstanceEditorStageCreate[];
  groupCreates: InstanceEditorGroupCreate[];
  itemCreates: InstanceEditorItemCreate[];
  itemDeletes: Record<string, true>;
  /** stageId → полный порядок id элементов этапа */
  itemReorders: Record<string, string[]>;
  /** stageId → порядок id пользовательских групп (без системных) */
  groupReorders: Record<string, string[]>;
  /** Скрытие пользовательской группы (disable items + remove group), как POST …/hide */
  groupHides: Record<string, true>;
  itemStructuralPatches: Record<string, InstanceEditorItemStructuralPatch>;
};

export function createEmptyInstanceEditorDraft(): InstanceEditorDraft {
  return {
    stageMetadata: {},
    groupPatches: {},
    itemPatches: {},
    stageOrder: null,
    stageCreates: [],
    groupCreates: [],
    itemCreates: [],
    itemDeletes: {},
    itemReorders: {},
    groupReorders: {},
    groupHides: {},
    itemStructuralPatches: {},
  };
}

export function isInstanceEditorDraftEmpty(draft: InstanceEditorDraft): boolean {
  return (
    Object.keys(draft.stageMetadata).length === 0 &&
    Object.keys(draft.groupPatches).length === 0 &&
    Object.keys(draft.itemPatches).length === 0 &&
    draft.stageOrder === null &&
    draft.stageCreates.length === 0 &&
    draft.groupCreates.length === 0 &&
    draft.itemCreates.length === 0 &&
    Object.keys(draft.itemDeletes).length === 0 &&
    Object.keys(draft.itemReorders).length === 0 &&
    Object.keys(draft.groupReorders).length === 0 &&
    Object.keys(draft.groupHides).length === 0 &&
    Object.keys(draft.itemStructuralPatches).length === 0
  );
}

function pickFirstFiniteNum(...values: unknown[]): number | null {
  for (const v of values) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

function normalizeNullableText(value: string | null | undefined): string | null {
  if (value == null) return null;
  const t = value.trim();
  return t === "" ? null : t;
}

function orderedIdsEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

/** Сравнимое с UI чтение нагрузки упражнения из baseline. */
export function readInstanceItemLoadSettingsPatch(
  item: TreatmentProgramInstanceStageItemRow,
): InstanceEditorItemLoadSettingsPatch {
  if (item.itemType !== "exercise") {
    return { reps: null, sets: null, maxPain: null };
  }
  const ov =
    item.settings != null && typeof item.settings === "object" && !Array.isArray(item.settings)
      ? (item.settings as Record<string, unknown>)
      : {};
  const snap = item.snapshot;
  return {
    reps: pickFirstFiniteNum(ov.reps, snap.reps),
    sets: pickFirstFiniteNum(ov.sets, snap.sets),
    maxPain: pickFirstFiniteNum(ov.maxPain, snap.maxPain, snap.difficulty),
  };
}

function loadSettingsEqual(
  a: InstanceEditorItemLoadSettingsPatch,
  b: InstanceEditorItemLoadSettingsPatch,
): boolean {
  return a.reps === b.reps && a.sets === b.sets && a.maxPain === b.maxPain;
}

type InstanceEditorStageNode = TreatmentProgramInstanceDetail["stages"][number];

function findStage(baseline: TreatmentProgramInstanceDetail, stageId: string) {
  return baseline.stages.find((s) => s.id === stageId) ?? null;
}

function findGroup(stage: InstanceEditorStageNode, groupId: string) {
  return stage.groups.find((g) => g.id === groupId) ?? null;
}

function findItemInDetail(detail: TreatmentProgramInstanceDetail, itemId: string) {
  for (const st of detail.stages) {
    const item = st.items.find((i) => i.id === itemId);
    if (item) return item;
  }
  return null;
}

function findItem(baseline: TreatmentProgramInstanceDetail, itemId: string) {
  return findItemInDetail(baseline, itemId);
}

function baselineStageIdOrder(stages: TreatmentProgramInstanceDetail["stages"]): string[] {
  return sortByOrderThenId(stages).map((s) => s.id);
}

function defaultStageIdOrderAfterCreates(
  baseline: TreatmentProgramInstanceDetail,
  stageCreates: InstanceEditorStageCreate[],
): string[] {
  const sorted = sortByOrderThenId(baseline.stages);
  if (stageCreates.length === 0) return sorted.map((s) => s.id);
  return [...sorted.map((s) => s.id), ...stageCreates.map((s) => s.clientId)];
}

function userGroupIdsInDisplayOrder(stage: InstanceEditorStageNode): string[] {
  const user = stage.groups.filter((g) => !g.systemKind);
  return sortByOrderThenId(user).map((g) => g.id);
}

function stageItemIdsInDisplayOrder(stage: InstanceEditorStageNode): string[] {
  return sortByOrderThenId(stage.items).map((i) => i.id);
}

function stageMetadataPatchDiffers(
  stage: InstanceEditorStageNode,
  patch: InstanceEditorStageMetadataPatch,
): boolean {
  if (patch.title !== undefined && patch.title !== stage.title) return true;
  if (patch.description !== undefined && patch.description !== stage.description) return true;
  if (patch.goals !== undefined && patch.goals !== stage.goals) return true;
  if (patch.objectives !== undefined && patch.objectives !== stage.objectives) return true;
  if (patch.expectedDurationDays !== undefined && patch.expectedDurationDays !== stage.expectedDurationDays) {
    return true;
  }
  if (patch.expectedDurationText !== undefined && patch.expectedDurationText !== stage.expectedDurationText) {
    return true;
  }
  return false;
}

function groupPatchDiffers(
  group: TreatmentProgramInstanceStageGroup,
  patch: InstanceEditorGroupPatch,
): boolean {
  if (patch.title !== undefined && patch.title !== group.title) return true;
  if (patch.description !== undefined && patch.description !== group.description) return true;
  if (patch.scheduleText !== undefined && patch.scheduleText !== group.scheduleText) return true;
  return false;
}

function itemPatchDiffers(
  item: TreatmentProgramInstanceStageItemRow,
  patch: InstanceEditorItemPatch,
): boolean {
  if (patch.localComment !== undefined) {
    const next = normalizeNullableText(patch.localComment);
    const base = normalizeNullableText(item.localComment);
    if (next !== base) return true;
  }
  if (patch.loadSettings) {
    const baseLoad = readInstanceItemLoadSettingsPatch(item);
    if (!loadSettingsEqual(patch.loadSettings, baseLoad)) return true;
  }
  return false;
}

function itemStructuralPatchDiffers(
  item: TreatmentProgramInstanceStageItemRow,
  patch: InstanceEditorItemStructuralPatch,
): boolean {
  if (patch.groupId !== undefined && patch.groupId !== item.groupId) return true;
  if (patch.isActionable !== undefined && patch.isActionable !== item.isActionable) return true;
  if (patch.status !== undefined && patch.status !== item.status) return true;
  if (patch.replace) {
    if (patch.replace.itemType !== item.itemType) return true;
    if (patch.replace.itemRefId !== item.itemRefId) return true;
  }
  return false;
}

function buildDraftStageRow(
  create: InstanceEditorStageCreate,
  instanceId: string,
  sortOrder: number,
): InstanceEditorStageNode {
  return {
    id: create.clientId,
    instanceId,
    sourceStageId: null,
    title: create.title,
    description: create.description ?? null,
    sortOrder,
    status: "available",
    skipReason: null,
    localComment: null,
    startedAt: null,
    goals: create.goals ?? null,
    objectives: create.objectives ?? null,
    expectedDurationDays: create.expectedDurationDays ?? null,
    expectedDurationText: create.expectedDurationText ?? null,
    groups: [],
    items: [],
  };
}

function buildDraftGroupRow(create: InstanceEditorGroupCreate, sortOrder: number): TreatmentProgramInstanceStageGroup {
  return {
    id: create.clientId,
    stageId: create.stageId,
    sourceGroupId: null,
    title: create.title,
    description: create.description ?? null,
    scheduleText: create.scheduleText ?? null,
    sortOrder,
    systemKind: null,
  };
}

function buildDraftItemRowFromParts(input: {
  clientId: string;
  stageId: string;
  itemType: TreatmentProgramItemType;
  itemRefId: string;
  groupId?: string | null;
  snapshot: Record<string, unknown>;
  localComment?: string | null;
  isActionable?: boolean | null;
}): TreatmentProgramInstanceStageItemView {
  const row: TreatmentProgramInstanceStageItemRow = {
    id: input.clientId,
    stageId: input.stageId,
    itemType: input.itemType,
    itemRefId: input.itemRefId,
    sortOrder: 9999,
    comment: null,
    localComment: input.localComment ?? null,
    settings: null,
    snapshot: input.snapshot,
    completedAt: null,
    isActionable: input.isActionable ?? null,
    status: "active",
    groupId: input.groupId ?? null,
    createdAt: new Date(0).toISOString(),
    lastViewedAt: null,
  };
  return {
    ...row,
    effectiveComment: effectiveInstanceStageItemComment(row),
  };
}

function materializeItemCreatesForStage(
  creates: InstanceEditorItemCreate[],
  stageId: string,
): TreatmentProgramInstanceStageItemView[] {
  const rows: TreatmentProgramInstanceStageItemView[] = [];
  for (const create of creates) {
    if (create.stageId !== stageId) continue;
    switch (create.kind) {
      case "library_item":
        rows.push(buildDraftItemRowFromParts(create));
        break;
      case "freeform_recommendation":
        rows.push(
          buildDraftItemRowFromParts({
            clientId: create.clientId,
            stageId: create.stageId,
            itemType: "recommendation",
            itemRefId: create.clientId,
            snapshot: create.snapshot,
          }),
        );
        break;
      case "test_set_expand":
        for (const item of create.items) {
          rows.push(
            buildDraftItemRowFromParts({
              clientId: item.clientId,
              stageId: create.stageId,
              itemType: "clinical_test",
              itemRefId: item.itemRefId,
              snapshot: item.snapshot,
            }),
          );
        }
        break;
      case "lfk_complex_expand":
        for (const item of create.items) {
          rows.push(
            buildDraftItemRowFromParts({
              clientId: item.clientId,
              stageId: create.stageId,
              itemType: "exercise",
              itemRefId: item.itemRefId,
              groupId: create.groupId,
              snapshot: item.snapshot,
            }),
          );
        }
        break;
    }
  }
  return rows;
}

function applyGroupHidesToStage(
  stage: InstanceEditorStageNode,
  groupHides: Record<string, true>,
): InstanceEditorStageNode {
  if (Object.keys(groupHides).length === 0) return stage;
  const nextGroups = stage.groups.filter((g) => !groupHides[g.id]);
  const nextItems = stage.items.map((item) => {
    if (item.groupId && groupHides[item.groupId]) {
      return { ...item, status: "disabled" as const, effectiveComment: item.effectiveComment };
    }
    return item;
  });
  return { ...stage, groups: nextGroups, items: nextItems };
}

function applyUserGroupReorder(
  groups: TreatmentProgramInstanceStageGroup[],
  orderedUserGroupIds: string[],
): TreatmentProgramInstanceStageGroup[] {
  const rec = groups.filter((g) => g.systemKind === "recommendations");
  const tests = groups.filter((g) => g.systemKind === "tests");
  const user = groups.filter((g) => !g.systemKind);
  const byId = new Map(user.map((g) => [g.id, g]));
  const reordered: TreatmentProgramInstanceStageGroup[] = [];
  for (const id of orderedUserGroupIds) {
    const g = byId.get(id);
    if (g) reordered.push(g);
  }
  for (const g of user) {
    if (!orderedUserGroupIds.includes(g.id)) reordered.push(g);
  }
  let sortOrder = 0;
  const assign = (rows: TreatmentProgramInstanceStageGroup[]) =>
    rows.map((g) => ({ ...g, sortOrder: sortOrder++ }));
  return [...assign(rec), ...assign(reordered), ...assign(tests)];
}

function reorderRowsById<T extends { id: string; sortOrder: number }>(
  rows: T[],
  orderedIds: string[],
): T[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const out: T[] = [];
  for (const id of orderedIds) {
    const row = byId.get(id);
    if (row) out.push(row);
  }
  for (const row of rows) {
    if (!orderedIds.includes(row.id)) out.push(row);
  }
  let sortOrder = 0;
  return out.map((r) => ({ ...r, sortOrder: sortOrder++ }));
}

function mergeItemSettings(
  settings: Record<string, unknown> | null,
  loadSettings: InstanceEditorItemLoadSettingsPatch,
): Record<string, unknown> {
  const base =
    settings != null && typeof settings === "object" && !Array.isArray(settings)
      ? { ...settings }
      : {};
  base.reps = loadSettings.reps;
  base.sets = loadSettings.sets;
  base.maxPain = loadSettings.maxPain;
  return base;
}

function mergeItemRow(
  item: TreatmentProgramInstanceStageItemView,
  patch: InstanceEditorItemPatch | undefined,
  structural: InstanceEditorItemStructuralPatch | undefined,
): TreatmentProgramInstanceStageItemView {
  let next: TreatmentProgramInstanceStageItemRow = item;
  if (structural?.replace) {
    next = {
      ...next,
      itemType: structural.replace.itemType,
      itemRefId: structural.replace.itemRefId,
      snapshot: structural.replace.snapshot,
    };
  }
  if (structural?.groupId !== undefined) {
    next = { ...next, groupId: structural.groupId };
  }
  if (structural?.isActionable !== undefined) {
    next = { ...next, isActionable: structural.isActionable };
  }
  if (structural?.status !== undefined) {
    next = { ...next, status: structural.status };
  }
  if (patch?.localComment !== undefined) {
    next = { ...next, localComment: patch.localComment };
  }
  if (patch?.loadSettings) {
    next = {
      ...next,
      settings: mergeItemSettings(next.settings, patch.loadSettings),
    };
  }
  return {
    ...next,
    effectiveComment: effectiveInstanceStageItemComment(next),
  };
}

function applyStageOrder(
  stages: InstanceEditorStageNode[],
  stageOrder: string[] | null,
): InstanceEditorStageNode[] {
  if (!stageOrder) return stages;
  const stageZeroId = stages.find((s) => s.sortOrder === 0)?.id ?? null;
  const byId = new Map(stages.map((s) => [s.id, s]));
  const ordered: InstanceEditorStageNode[] = [];
  for (const id of stageOrder) {
    const stage = byId.get(id);
    if (stage) ordered.push(stage);
  }
  for (const stage of stages) {
    if (!stageOrder.includes(stage.id)) ordered.push(stage);
  }
  const zero = stageZeroId ? ordered.find((s) => s.id === stageZeroId) : undefined;
  const pipeline = stageZeroId ? ordered.filter((s) => s.id !== stageZeroId) : ordered;
  const finalOrder = zero ? [zero, ...pipeline] : ordered;
  let sortOrder = 0;
  return finalOrder.map((s) => ({ ...s, sortOrder: sortOrder++ }));
}

/** Наложить черновик на серверное дерево без normalize (внутренний merge). */
export function mergeInstanceEditorDraftIntoDetailRaw(
  detail: TreatmentProgramInstanceDetail,
  draft: InstanceEditorDraft,
): TreatmentProgramInstanceDetail {
  const stageCreates = draft.stageCreates;
  const maxSort = detail.stages.reduce((m, s) => Math.max(m, s.sortOrder), 0);
  const draftStages = stageCreates.map((create, idx) =>
    buildDraftStageRow(create, detail.id, maxSort + idx + 1),
  );

  let stages: InstanceEditorStageNode[] = [
    ...detail.stages.map((stage) => {
      const stagePatch = draft.stageMetadata[stage.id];
      const nextStage = stagePatch
        ? {
            ...stage,
            ...(stagePatch.title !== undefined ? { title: stagePatch.title } : {}),
            ...(stagePatch.description !== undefined ? { description: stagePatch.description } : {}),
            ...(stagePatch.goals !== undefined ? { goals: stagePatch.goals } : {}),
            ...(stagePatch.objectives !== undefined ? { objectives: stagePatch.objectives } : {}),
            ...(stagePatch.expectedDurationDays !== undefined
              ? { expectedDurationDays: stagePatch.expectedDurationDays }
              : {}),
            ...(stagePatch.expectedDurationText !== undefined
              ? { expectedDurationText: stagePatch.expectedDurationText }
              : {}),
          }
        : stage;

      const groupsWithCreates = [...nextStage.groups];
      for (const groupCreate of draft.groupCreates) {
        if (groupCreate.stageId !== nextStage.id) continue;
        groupsWithCreates.push(
          buildDraftGroupRow(groupCreate, groupsWithCreates.length),
        );
      }

      let nextGroups = groupsWithCreates.map((group) => {
        const groupPatch = draft.groupPatches[group.id];
        if (!groupPatch) return group;
        return {
          ...group,
          ...(groupPatch.title !== undefined ? { title: groupPatch.title } : {}),
          ...(groupPatch.description !== undefined ? { description: groupPatch.description } : {}),
          ...(groupPatch.scheduleText !== undefined ? { scheduleText: groupPatch.scheduleText } : {}),
        };
      });

      const groupReorder = draft.groupReorders[nextStage.id];
      if (groupReorder) {
        nextGroups = applyUserGroupReorder(nextGroups, groupReorder);
      }

      const createdItems = materializeItemCreatesForStage(draft.itemCreates, nextStage.id);

      let nextItems = [...nextStage.items, ...createdItems]
        .filter((item) => !draft.itemDeletes[item.id])
        .map((item) =>
          mergeItemRow(item, draft.itemPatches[item.id], draft.itemStructuralPatches[item.id]),
        );

      const itemReorder = draft.itemReorders[nextStage.id];
      if (itemReorder) {
        nextItems = reorderRowsById(nextItems, itemReorder);
      }

      return applyGroupHidesToStage({ ...nextStage, groups: nextGroups, items: nextItems }, draft.groupHides);
    }),
    ...draftStages.map((stage) => {
      const groupsWithCreates = [...stage.groups];
      for (const groupCreate of draft.groupCreates) {
        if (groupCreate.stageId !== stage.id) continue;
        groupsWithCreates.push(buildDraftGroupRow(groupCreate, groupsWithCreates.length));
      }
      let nextGroups = groupsWithCreates.map((group) => {
        const groupPatch = draft.groupPatches[group.id];
        if (!groupPatch) return group;
        return {
          ...group,
          ...(groupPatch.title !== undefined ? { title: groupPatch.title } : {}),
          ...(groupPatch.description !== undefined ? { description: groupPatch.description } : {}),
          ...(groupPatch.scheduleText !== undefined ? { scheduleText: groupPatch.scheduleText } : {}),
        };
      });
      const groupReorder = draft.groupReorders[stage.id];
      if (groupReorder) {
        nextGroups = applyUserGroupReorder(nextGroups, groupReorder);
      }
      const createdItems = materializeItemCreatesForStage(draft.itemCreates, stage.id);
      let nextItems = [...stage.items, ...createdItems]
        .filter((item) => !draft.itemDeletes[item.id])
        .map((item) =>
          mergeItemRow(item, draft.itemPatches[item.id], draft.itemStructuralPatches[item.id]),
        );
      const itemReorder = draft.itemReorders[stage.id];
      if (itemReorder) {
        nextItems = reorderRowsById(nextItems, itemReorder);
      }
      const stagePatch = draft.stageMetadata[stage.id];
      const patchedStage = stagePatch
        ? {
            ...stage,
            ...(stagePatch.title !== undefined ? { title: stagePatch.title } : {}),
            ...(stagePatch.description !== undefined ? { description: stagePatch.description } : {}),
            ...(stagePatch.goals !== undefined ? { goals: stagePatch.goals } : {}),
            ...(stagePatch.objectives !== undefined ? { objectives: stagePatch.objectives } : {}),
            ...(stagePatch.expectedDurationDays !== undefined
              ? { expectedDurationDays: stagePatch.expectedDurationDays }
              : {}),
            ...(stagePatch.expectedDurationText !== undefined
              ? { expectedDurationText: stagePatch.expectedDurationText }
              : {}),
          }
        : stage;
      return applyGroupHidesToStage({ ...patchedStage, groups: nextGroups, items: nextItems }, draft.groupHides);
    }),
  ];

  stages = applyStageOrder(stages, draft.stageOrder);

  return { ...detail, stages };
}

/** Убрать патчи, совпадающие с baseline (ложный dirty / no-op blur). */
export function normalizeInstanceEditorDraft(
  draft: InstanceEditorDraft,
  baseline: TreatmentProgramInstanceDetail,
): InstanceEditorDraft {
  const next = createEmptyInstanceEditorDraft();

  for (const [stageId, patch] of Object.entries(draft.stageMetadata)) {
    const stage = findStage(baseline, stageId);
    if (stage && stageMetadataPatchDiffers(stage, patch)) {
      next.stageMetadata[stageId] = patch;
    }
  }

  next.stageCreates = [...draft.stageCreates];
  next.groupCreates = [...draft.groupCreates];
  let itemCreates = [...draft.itemCreates];
  for (const [itemId] of Object.entries(draft.itemDeletes)) {
    itemCreates = removeItemFromInstanceEditorItemCreates(itemCreates, itemId);
  }
  next.itemCreates = itemCreates;

  for (const [stageId, patch] of Object.entries(draft.stageMetadata)) {
    if (next.stageMetadata[stageId]) continue;
    const create = next.stageCreates.find((c) => c.clientId === stageId);
    if (!create) continue;
    const draftStage = buildDraftStageRow(create, baseline.id, 0);
    if (stageMetadataPatchDiffers(draftStage, patch)) {
      next.stageMetadata[stageId] = patch;
    }
  }

  const partialForPatchCompare: InstanceEditorDraft = {
    ...next,
    groupPatches: {},
    itemPatches: {},
  };
  const mergedForPatches = mergeInstanceEditorDraftIntoDetailRaw(baseline, partialForPatchCompare);

  for (const [groupId, patch] of Object.entries(draft.groupPatches)) {
    for (const st of mergedForPatches.stages) {
      const group = findGroup(st, groupId);
      if (group && groupPatchDiffers(group, patch)) {
        next.groupPatches[groupId] = patch;
        break;
      }
    }
  }

  for (const [itemId, patch] of Object.entries(draft.itemPatches)) {
    const item = findItemInDetail(mergedForPatches, itemId);
    if (item && itemPatchDiffers(item, patch)) {
      next.itemPatches[itemId] = patch;
    }
  }

  for (const [itemId] of Object.entries(draft.itemDeletes)) {
    if (findItem(baseline, itemId)) {
      next.itemDeletes[itemId] = true;
    }
  }

  for (const [groupId] of Object.entries(draft.groupHides)) {
    if (isInstanceEditorDraftClientId(groupId)) continue;
    for (const st of baseline.stages) {
      const group = findGroup(st, groupId);
      if (group && !group.systemKind) {
        next.groupHides[groupId] = true;
        break;
      }
    }
  }

  if (draft.stageOrder) {
    const expected = defaultStageIdOrderAfterCreates(baseline, next.stageCreates);
    if (!orderedIdsEqual(draft.stageOrder, expected)) {
      next.stageOrder = draft.stageOrder;
    }
  }

  const partialForReorderCompare: InstanceEditorDraft = {
    ...next,
    itemReorders: {},
    groupReorders: {},
  };
  const mergedForReorder = mergeInstanceEditorDraftIntoDetailRaw(baseline, partialForReorderCompare);

  for (const [stageId, order] of Object.entries(draft.groupReorders)) {
    const stage = mergedForReorder.stages.find((s) => s.id === stageId);
    if (!stage) continue;
    const baselineOrder = userGroupIdsInDisplayOrder(stage);
    if (!orderedIdsEqual(order, baselineOrder)) {
      next.groupReorders[stageId] = order;
    }
  }

  for (const [stageId, order] of Object.entries(draft.itemReorders)) {
    const stage = mergedForReorder.stages.find((s) => s.id === stageId);
    if (!stage) continue;
    const baselineOrder = stageItemIdsInDisplayOrder(stage);
    if (!orderedIdsEqual(order, baselineOrder)) {
      next.itemReorders[stageId] = order;
    }
  }

  const partialForStructural: InstanceEditorDraft = {
    ...next,
    itemStructuralPatches: {},
  };
  const mergedForStructural = mergeInstanceEditorDraftIntoDetailRaw(baseline, partialForStructural);

  for (const [itemId, patch] of Object.entries(draft.itemStructuralPatches)) {
    const item = findItemInDetail(mergedForStructural, itemId);
    if (item && itemStructuralPatchDiffers(item, patch)) {
      next.itemStructuralPatches[itemId] = patch;
    }
  }

  return next;
}

export function isInstanceEditorDraftDirty(
  draft: InstanceEditorDraft,
  baseline: TreatmentProgramInstanceDetail,
): boolean {
  return !isInstanceEditorDraftEmpty(normalizeInstanceEditorDraft(draft, baseline));
}

/** Наложить черновик на серверное дерево для отображения в редакторе. */
export function mergeInstanceEditorDraftIntoDetail(
  detail: TreatmentProgramInstanceDetail,
  draft: InstanceEditorDraft,
): TreatmentProgramInstanceDetail {
  const normalized = normalizeInstanceEditorDraft(draft, detail);
  if (isInstanceEditorDraftEmpty(normalized)) return detail;
  return mergeInstanceEditorDraftIntoDetailRaw(detail, normalized);
}

/** Патчи, которые реально нужно отправить на сервер (полный normalize). */
export function pickInstanceEditorDraftChanges(
  draft: InstanceEditorDraft,
  baseline: TreatmentProgramInstanceDetail,
): InstanceEditorDraft {
  return normalizeInstanceEditorDraft(draft, baseline);
}

export type InstanceEditorDraftFlushChanges = Pick<
  InstanceEditorDraft,
  "stageMetadata" | "groupPatches" | "itemPatches"
>;

/** Секции черновика, которые сейчас сбрасывает legacy `flushInstanceEditorDraft` (до batch API фазы 3). */
export function pickInstanceEditorDraftFlushChanges(
  draft: InstanceEditorDraft,
  baseline: TreatmentProgramInstanceDetail,
): InstanceEditorDraftFlushChanges {
  const normalized = normalizeInstanceEditorDraft(draft, baseline);
  return {
    stageMetadata: normalized.stageMetadata,
    groupPatches: normalized.groupPatches,
    itemPatches: normalized.itemPatches,
  };
}

export function isInstanceEditorDraftFlushEmpty(changes: InstanceEditorDraftFlushChanges): boolean {
  return (
    Object.keys(changes.stageMetadata).length === 0 &&
    Object.keys(changes.groupPatches).length === 0 &&
    Object.keys(changes.itemPatches).length === 0
  );
}

/** Структурные правки (reorder/create/delete/replace) — batch-save фазы 3. */
export function hasInstanceEditorDraftStructuralChanges(
  draft: InstanceEditorDraft,
  baseline: TreatmentProgramInstanceDetail,
): boolean {
  const normalized = normalizeInstanceEditorDraft(draft, baseline);
  return (
    normalized.stageOrder !== null ||
    normalized.stageCreates.length > 0 ||
    normalized.groupCreates.length > 0 ||
    normalized.itemCreates.length > 0 ||
    Object.keys(normalized.itemDeletes).length > 0 ||
    Object.keys(normalized.itemReorders).length > 0 ||
    Object.keys(normalized.groupReorders).length > 0 ||
    Object.keys(normalized.groupHides).length > 0 ||
    Object.keys(normalized.itemStructuralPatches).length > 0
  );
}

/** После legacy flush — сохранить structural-секции черновика. */
export function clearFlushableInstanceEditorDraftSections(draft: InstanceEditorDraft): InstanceEditorDraft {
  return {
    ...draft,
    stageMetadata: {},
    groupPatches: {},
    itemPatches: {},
  };
}
