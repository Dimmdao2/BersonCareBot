import type {
  TreatmentProgramInstancePort,
  TreatmentProgramItemRefValidationPort,
  TreatmentProgramItemSnapshotPort,
  TreatmentProgramTestAttemptsPort,
} from "./ports";
import type { TreatmentProgramService } from "./service";
import { assertUuid } from "./service";
import {
  createEmptyProgramChangedDiff,
  isInstanceEditorBatchDraftEmpty,
  isProgramChangedDiffEmpty,
  type InstanceEditorBatchDraft,
  type ProgramChangedDiff,
} from "./instanceEditorBatchSchema";
import type {
  TreatmentProgramInstanceDetail,
  TreatmentProgramInstanceStageItemRow,
  TreatmentProgramItemType,
  UpdateTreatmentProgramInstanceStageGroupInput,
  UpdateTreatmentProgramInstanceStageMetadataInput,
} from "./types";
import { isStageZero, assertTreatmentProgramStageItemFitsSystemGroup } from "./stage-semantics";

const DRAFT_ID_PREFIX = "draft:";

/** Канонический снимок каталога при сохранении editor-batch (не preview-черновик из браузера). */
async function catalogSnapshotForEditorBatch(
  snapshots: TreatmentProgramItemSnapshotPort,
  itemType: TreatmentProgramItemType,
  itemRefId: string,
): Promise<Record<string, unknown>> {
  return snapshots.buildSnapshot(itemType, itemRefId);
}

export function isInstanceEditorBatchClientId(id: string): boolean {
  return id.startsWith(DRAFT_ID_PREFIX);
}

function resolveBatchId(id: string, idMap: Map<string, string>, label: string): string {
  if (!isInstanceEditorBatchClientId(id)) {
    assertUuid(id);
    return id;
  }
  const resolved = idMap.get(id);
  if (!resolved) throw new Error(`${label}: неизвестный черновой идентификатор`);
  return resolved;
}

function resolveOptionalBatchId(
  id: string | null | undefined,
  idMap: Map<string, string>,
  label: string,
): string | null | undefined {
  if (id === undefined) return undefined;
  if (id === null) return null;
  return resolveBatchId(id, idMap, label);
}

async function assertStageItemAllowsStructuralChange(
  item: TreatmentProgramInstanceStageItemRow,
  testAttempts: TreatmentProgramTestAttemptsPort | undefined,
): Promise<void> {
  if (item.completedAt) {
    throw new Error("Нельзя удалить или заменить элемент с отметкой выполнения или историей теста");
  }
  if (testAttempts && (await testAttempts.hasAnyAttemptForStageItem(item.id))) {
    throw new Error("Нельзя удалить или заменить элемент с отметкой выполнения или историей теста");
  }
}

function mergeLoadSettings(
  prevRaw: Record<string, unknown> | null,
  patch: { reps?: number | null; sets?: number | null; maxPain?: number | null },
): Record<string, unknown> | null {
  const prev =
    prevRaw != null && typeof prevRaw === "object" && !Array.isArray(prevRaw)
      ? { ...prevRaw }
      : {};

  const applyInt = (
    key: "reps" | "sets" | "maxPain",
    incoming: number | null | undefined,
    min: number,
    max: number,
    label: string,
  ) => {
    if (incoming === undefined) return;
    if (incoming === null) {
      delete prev[key];
      return;
    }
    const n = Math.round(incoming);
    if (!Number.isFinite(n) || n < min || n > max) {
      throw new Error(`${label}: целое число от ${min} до ${max}`);
    }
    prev[key] = n;
  };

  applyInt("reps", patch.reps, 1, 999, "Повторы");
  applyInt("sets", patch.sets, 1, 99, "Подходы");
  applyInt("maxPain", patch.maxPain, 0, 10, "Макс. боль");

  return Object.keys(prev).length === 0 ? null : prev;
}

function buildPreviewIdMap(draft: InstanceEditorBatchDraft): Map<string, string> {
  const map = new Map<string, string>();
  for (const stageCreate of draft.stageCreates) {
    map.set(stageCreate.clientId, stageCreate.clientId);
  }
  for (const groupCreate of draft.groupCreates) {
    map.set(groupCreate.clientId, groupCreate.clientId);
  }
  for (const create of draft.itemCreates) {
    if (create.kind === "test_set_expand" || create.kind === "lfk_complex_expand") {
      for (const line of create.items) {
        map.set(line.clientId, line.clientId);
      }
    } else {
      map.set(create.clientId, create.clientId);
    }
  }
  return map;
}

function assertPersistedStageInDetail(
  detail: TreatmentProgramInstanceDetail,
  stageId: string,
  previewIdMap: Map<string, string>,
): void {
  if (isInstanceEditorBatchClientId(stageId)) {
    if (!previewIdMap.has(stageId)) {
      throw new Error("Этап: неизвестный черновой идентификатор");
    }
    return;
  }
  if (!detail.stages.some((s) => s.id === stageId)) {
    throw new Error("Этап не найден");
  }
}

function sameIdSet(ordered: string[], expected: Set<string>): boolean {
  if (ordered.length !== expected.size) return false;
  const seen = new Set<string>();
  for (const id of ordered) {
    if (!expected.has(id) || seen.has(id)) return false;
    seen.add(id);
  }
  return true;
}

function assertSameIdSet(ordered: string[], expected: Set<string>, label: string): void {
  if (!sameIdSet(ordered, expected)) {
    throw new Error(`Некорректный порядок: ${label}`);
  }
}

function collectExpectedItemIdsForStage(
  detail: TreatmentProgramInstanceDetail,
  draft: InstanceEditorBatchDraft,
  resolvedStageId: string,
  previewIdMap: Map<string, string>,
): Set<string> {
  const ids = new Set<string>();
  const stage = detail.stages.find((s) => s.id === resolvedStageId);
  if (stage) {
    for (const item of stage.items) {
      if (!draft.itemDeletes[item.id]) ids.add(item.id);
    }
  }
  for (const create of draft.itemCreates) {
    const createStageResolved = resolveBatchId(create.stageId, previewIdMap, "Этап");
    if (createStageResolved !== resolvedStageId) continue;
    if (create.kind === "test_set_expand" || create.kind === "lfk_complex_expand") {
      for (const line of create.items) ids.add(line.clientId);
    } else {
      ids.add(create.clientId);
    }
  }
  return ids;
}

function validateLoadSettingsPatch(
  item: TreatmentProgramInstanceStageItemRow,
  patch: { reps?: number | null; sets?: number | null; maxPain?: number | null },
): void {
  if (item.itemType !== "exercise") {
    throw new Error("Нагрузку можно менять только для упражнений");
  }
  mergeLoadSettings(item.settings as Record<string, unknown> | null, patch);
}

function validateItemStructuralGroupPatch(
  detail: TreatmentProgramInstanceDetail,
  item: TreatmentProgramInstanceStageItemRow,
  patch: { groupId?: string | null },
  previewIdMap: Map<string, string>,
): void {
  const stage = detail.stages.find((s) => s.id === item.stageId);
  if (!stage) throw new Error("Этап не найден");
  let nextGroupId = resolveOptionalBatchId(patch.groupId, previewIdMap, "Группа") ?? null;
  if (isStageZero(stage)) {
    if (item.itemType !== "recommendation") {
      throw new Error("На этапе «Общие рекомендации» разрешены только рекомендации");
    }
    if (patch.groupId != null) {
      throw new Error("На этапе «Общие рекомендации» элементы не привязываются к группам");
    }
    return;
  }
  if (!nextGroupId) {
    if (item.itemType === "recommendation" || item.itemType === "clinical_test") return;
    throw new Error("Выберите группу для этого типа элемента");
  }
  const g = stage.groups.find((gr) => gr.id === nextGroupId);
  assertTreatmentProgramStageItemFitsSystemGroup(g, item.itemType);
}

async function validateInstanceEditorBatchDraft(
  deps: ApplyInstanceEditorBatchDeps,
  input: {
    instanceId: string;
    draft: InstanceEditorBatchDraft;
    detail: TreatmentProgramInstanceDetail;
  },
): Promise<void> {
  const { draft, detail } = input;
  const { itemRefs, testAttempts } = deps;
  const previewIdMap = buildPreviewIdMap(draft);

  if (draft.stageOrder) {
    const orderedStageIds = draft.stageOrder.map((id, i) =>
      resolveBatchId(id, previewIdMap, `Этап ${i + 1}`),
    );
    const stageZero = detail.stages.find((s) => s.sortOrder === 0);
    if (stageZero && orderedStageIds[0] !== stageZero.id) {
      throw new Error("Этап «Общие рекомендации» должен оставаться первым");
    }
    const expectedStageIds = new Set([
      ...detail.stages.map((s) => s.id),
      ...draft.stageCreates.map((sc) => sc.clientId),
    ]);
    assertSameIdSet(orderedStageIds, expectedStageIds, "этапов");
    for (const stageId of orderedStageIds) {
      assertPersistedStageInDetail(detail, stageId, previewIdMap);
    }
  }

  for (const [stageIdRaw, patch] of Object.entries(draft.stageMetadata)) {
    const stageId = resolveBatchId(stageIdRaw, previewIdMap, "Этап");
    assertPersistedStageInDetail(detail, stageId, previewIdMap);
    if (patch.title !== undefined && !patch.title.trim()) {
      throw new Error("Название этапа не может быть пустым");
    }
  }

  for (const [groupIdRaw, patch] of Object.entries(draft.groupPatches)) {
    const groupId = resolveBatchId(groupIdRaw, previewIdMap, "Группа");
    if (!isInstanceEditorBatchClientId(groupId)) {
      const gr = detail.stages.flatMap((s) => s.groups).find((g) => g.id === groupId);
      if (!gr) throw new Error("Группа не найдена");
    }
    if (patch.title !== undefined && !patch.title.trim()) {
      throw new Error("Название группы не может быть пустым");
    }
  }

  for (const groupCreate of draft.groupCreates) {
    assertPersistedStageInDetail(
      detail,
      resolveBatchId(groupCreate.stageId, previewIdMap, "Этап"),
      previewIdMap,
    );
  }

  for (const create of draft.itemCreates) {
    if (create.kind === "library_item") {
      if ((create.itemType as string) === "lfk_complex") {
        throw new Error("Для комплекса ЛФК используйте разворот комплекса");
      }
      await itemRefs.assertItemRefExists(create.itemType, create.itemRefId);
      const stageId = resolveBatchId(create.stageId, previewIdMap, "Этап");
      const stage = detail.stages.find((s) => s.id === stageId);
      if (!stage && !previewIdMap.has(create.stageId)) {
        throw new Error("Этап не найден");
      }
      if (stage && isStageZero(stage)) {
        if (create.itemType !== "recommendation") {
          throw new Error("На этапе «Общие рекомендации» разрешены только рекомендации");
        }
        if (create.groupId != null) {
          throw new Error("На этапе «Общие рекомендации» элементы не привязываются к группам");
        }
      }
      if (create.itemType === "exercise" && create.loadSettings) {
        mergeLoadSettings(null, create.loadSettings);
      }
    } else if (create.kind === "freeform_recommendation") {
      assertPersistedStageInDetail(
        detail,
        resolveBatchId(create.stageId, previewIdMap, "Этап"),
        previewIdMap,
      );
    } else if (create.kind === "test_set_expand") {
      const stageId = resolveBatchId(create.stageId, previewIdMap, "Этап");
      assertPersistedStageInDetail(detail, stageId, previewIdMap);
      for (const line of create.items) {
        await itemRefs.assertItemRefExists("clinical_test", line.itemRefId);
      }
    } else {
      const stageId = resolveBatchId(create.stageId, previewIdMap, "Этап");
      assertPersistedStageInDetail(detail, stageId, previewIdMap);
      resolveBatchId(create.groupId, previewIdMap, "Группа");
      for (const line of create.items) {
        await itemRefs.assertItemRefExists("exercise", line.itemRefId);
        if (line.loadSettings) {
          mergeLoadSettings(null, line.loadSettings);
        }
      }
    }
  }

  for (const [groupIdRaw] of Object.entries(draft.groupHides)) {
    if (isInstanceEditorBatchClientId(groupIdRaw)) continue;
    const groupId = resolveBatchId(groupIdRaw, previewIdMap, "Группа");
    const gr = detail.stages.flatMap((s) => s.groups).find((g) => g.id === groupId);
    if (!gr) continue;
    if (gr.systemKind === "recommendations" || gr.systemKind === "tests") {
      throw new Error("Системную группу нельзя скрыть");
    }
  }

  for (const [itemIdRaw] of Object.entries(draft.itemDeletes)) {
    if (isInstanceEditorBatchClientId(itemIdRaw)) continue;
    const itemId = resolveBatchId(itemIdRaw, previewIdMap, "Элемент");
    const item = detail.stages.flatMap((s) => s.items).find((i) => i.id === itemId);
    if (!item) continue;
    await assertStageItemAllowsStructuralChange(item, testAttempts);
  }

  for (const [itemIdRaw, patch] of Object.entries(draft.itemStructuralPatches)) {
    if (isInstanceEditorBatchClientId(itemIdRaw)) continue;
    const itemId = resolveBatchId(itemIdRaw, previewIdMap, "Элемент");
    const item = detail.stages.flatMap((s) => s.items).find((i) => i.id === itemId);
    if (!item) throw new Error("Элемент не найден");
    if (patch.replace) {
      await assertStageItemAllowsStructuralChange(item, testAttempts);
      await itemRefs.assertItemRefExists(patch.replace.itemType, patch.replace.itemRefId);
    }
    if (patch.isActionable !== undefined && item.itemType !== "recommendation") {
      throw new Error("Режим выполнения задаётся только для рекомендаций");
    }
    if (patch.groupId !== undefined) {
      validateItemStructuralGroupPatch(detail, item, patch, previewIdMap);
    }
  }

  for (const [stageIdRaw, orderedGroupIds] of Object.entries(draft.groupReorders)) {
    const stageId = resolveBatchId(stageIdRaw, previewIdMap, "Этап");
    assertPersistedStageInDetail(detail, stageId, previewIdMap);
    const stage = detail.stages.find((s) => s.id === stageId);
    if (!stage) throw new Error("Этап не найден");
    const userGroupIds = stage.groups
      .filter((g) => g.systemKind !== "recommendations" && g.systemKind !== "tests")
      .map((g) => g.id);
    for (const gc of draft.groupCreates) {
      if (resolveBatchId(gc.stageId, previewIdMap, "Этап") === stageId) {
        userGroupIds.push(gc.clientId);
      }
    }
    const resolved = orderedGroupIds.map((id, i) => resolveBatchId(id, previewIdMap, `Группа ${i + 1}`));
    assertSameIdSet(resolved, new Set(userGroupIds), "групп этапа");
  }

  for (const [stageIdRaw, orderedItemIds] of Object.entries(draft.itemReorders)) {
    const stageId = resolveBatchId(stageIdRaw, previewIdMap, "Этап");
    assertPersistedStageInDetail(detail, stageId, previewIdMap);
    const expected = collectExpectedItemIdsForStage(detail, draft, stageId, previewIdMap);
    const resolved = orderedItemIds.map((id, i) => resolveBatchId(id, previewIdMap, `Элемент ${i + 1}`));
    assertSameIdSet(resolved, expected, "элементов этапа");
  }

  for (const [itemIdRaw, patch] of Object.entries(draft.itemPatches)) {
    if (isInstanceEditorBatchClientId(itemIdRaw)) continue;
    const itemId = resolveBatchId(itemIdRaw, previewIdMap, "Элемент");
    const item = detail.stages.flatMap((s) => s.items).find((i) => i.id === itemId);
    if (!item) throw new Error("Элемент не найден");
    if (patch.loadSettings) {
      validateLoadSettingsPatch(item, patch.loadSettings);
    }
  }
}

export type ApplyInstanceEditorBatchDeps = {
  instances: TreatmentProgramInstancePort;
  templates: TreatmentProgramService;
  snapshots: TreatmentProgramItemSnapshotPort;
  itemRefs: TreatmentProgramItemRefValidationPort;
  testAttempts?: TreatmentProgramTestAttemptsPort;
};

export async function applyInstanceEditorBatch(
  deps: ApplyInstanceEditorBatchDeps,
  input: {
    instanceId: string;
    draft: InstanceEditorBatchDraft;
  },
): Promise<{ detail: TreatmentProgramInstanceDetail; diff: ProgramChangedDiff }> {
  assertUuid(input.instanceId);
  if (isInstanceEditorBatchDraftEmpty(input.draft)) {
    const detail = await deps.instances.getInstanceById(input.instanceId);
    if (!detail) throw new Error("Программа не найдена");
    return { detail, diff: createEmptyProgramChangedDiff() };
  }

  const idMap = new Map<string, string>();
  const diff = createEmptyProgramChangedDiff();
  const { instances, itemRefs, testAttempts, snapshots } = deps;

  let detail = await instances.getInstanceById(input.instanceId);
  if (!detail) throw new Error("Программа не найдена");
  const baselineDetail = detail;

  await validateInstanceEditorBatchDraft(deps, {
    instanceId: input.instanceId,
    draft: input.draft,
    detail: baselineDetail,
  });

  return deps.instances.runInMutationTransaction(async () => {
  detail = baselineDetail;
  for (const stageCreate of input.draft.stageCreates) {
    const stage = await instances.addInstanceStage(input.instanceId, {
      title: stageCreate.title.trim(),
      description: stageCreate.description ?? null,
      sortOrder: detail.stages.reduce((m, s) => Math.max(m, s.sortOrder), -1) + 1,
      status: "locked",
      sourceStageId: null,
    });
    if (!stage) throw new Error("Не удалось добавить этап");
    idMap.set(stageCreate.clientId, stage.id);
    diff.stagesAdded += 1;

    const meta: UpdateTreatmentProgramInstanceStageMetadataInput = {};
    if (stageCreate.description !== undefined) {
      meta.description =
        stageCreate.description === null ? null : stageCreate.description.trim() || null;
    }
    if (stageCreate.goals !== undefined) {
      meta.goals = stageCreate.goals === null ? null : stageCreate.goals.trim() || null;
    }
    if (stageCreate.objectives !== undefined) {
      meta.objectives = stageCreate.objectives === null ? null : stageCreate.objectives.trim() || null;
    }
    if (stageCreate.expectedDurationDays !== undefined) meta.expectedDurationDays = stageCreate.expectedDurationDays;
    if (stageCreate.expectedDurationText !== undefined) {
      meta.expectedDurationText =
        stageCreate.expectedDurationText === null ? null : stageCreate.expectedDurationText.trim() || null;
    }
    if (Object.keys(meta).length > 0) {
      await instances.updateInstanceStageMetadata(input.instanceId, stage.id, meta);
      diff.stagesMetadataUpdated += 1;
    }
    detail = (await instances.getInstanceById(input.instanceId))!;
  }

  for (const groupCreate of input.draft.groupCreates) {
    const stageId = resolveBatchId(groupCreate.stageId, idMap, "Группа");
    const row = await instances.createInstanceStageGroup(input.instanceId, stageId, {
      title: groupCreate.title.trim(),
      description: groupCreate.description ?? undefined,
      scheduleText: groupCreate.scheduleText ?? undefined,
    });
    if (!row) throw new Error("Не удалось добавить группу");
    idMap.set(groupCreate.clientId, row.id);
    diff.groupsAdded += 1;
    detail = (await instances.getInstanceById(input.instanceId))!;
  }

  for (const create of input.draft.itemCreates) {
    if (create.kind === "library_item") {
      if ((create.itemType as string) === "lfk_complex") {
        throw new Error("Для комплекса ЛФК используйте разворот комплекса");
      }
      await itemRefs.assertItemRefExists(create.itemType, create.itemRefId);
      const stageId = resolveBatchId(create.stageId, idMap, "Элемент");
      const stage = detail.stages.find((s) => s.id === stageId);
      if (!stage) throw new Error("Этап не найден");
      let resolvedGroupId = resolveOptionalBatchId(create.groupId, idMap, "Группа элемента") ?? null;
      if (isStageZero(stage)) {
        if (create.itemType !== "recommendation") {
          throw new Error("На этапе «Общие рекомендации» разрешены только рекомендации");
        }
        if (resolvedGroupId) {
          throw new Error("На этапе «Общие рекомендации» элементы не привязываются к группам");
        }
      } else if (!resolvedGroupId) {
        if (create.itemType === "recommendation" || create.itemType === "clinical_test") {
          const want = create.itemType === "recommendation" ? "recommendations" : "tests";
          const sg = stage.groups.find((g) => g.systemKind === want);
          if (!sg) throw new Error("Системная группа этапа не найдена");
          resolvedGroupId = sg.id;
        } else {
          throw new Error("Выберите группу для этого типа элемента");
        }
      } else {
        const g = stage.groups.find((gr) => gr.id === resolvedGroupId);
        assertTreatmentProgramStageItemFitsSystemGroup(g, create.itemType);
      }
      const maxOrder = stage.items.reduce((m, i) => Math.max(m, i.sortOrder), -1);
      const settings =
        create.itemType === "exercise" && create.loadSettings
          ? mergeLoadSettings(null, create.loadSettings)
          : null;
      const row = await instances.addInstanceStageItem(input.instanceId, stageId, {
        itemType: create.itemType,
        itemRefId: create.itemRefId,
        sortOrder: maxOrder + 1,
        comment: null,
        settings,
        snapshot: await catalogSnapshotForEditorBatch(snapshots, create.itemType, create.itemRefId),
        isActionable: create.isActionable ?? (create.itemType === "recommendation" ? false : null),
        status: create.status ?? "active",
        groupId: resolvedGroupId,
      });
      if (!row) throw new Error("Не удалось добавить элемент");
      idMap.set(create.clientId, row.id);
      if (create.localComment !== undefined) {
        await instances.updateStageItemLocalComment(input.instanceId, row.id, create.localComment);
      }
      diff.itemsAdded += 1;
    } else if (create.kind === "freeform_recommendation") {
      const stageId = resolveBatchId(create.stageId, idMap, "Элемент");
      const result = await instances.createFreeformRecommendationAndStageItem({
        instanceId: input.instanceId,
        stageId,
        title: create.title.trim(),
        bodyMd: create.bodyMd.trim(),
        createdBy: null,
      });
      if (!result) throw new Error("Не удалось добавить рекомендацию");
      idMap.set(create.clientId, result.item.id);
      if (create.localComment !== undefined) {
        await instances.updateStageItemLocalComment(input.instanceId, result.item.id, create.localComment);
      }
      const freeformPatch: { isActionable?: boolean | null; status?: "active" | "disabled" } = {};
      if (create.isActionable !== undefined) {
        freeformPatch.isActionable = create.isActionable;
      }
      if (create.status !== undefined && create.status !== "active") {
        freeformPatch.status = create.status;
      }
      if (Object.keys(freeformPatch).length > 0) {
        const row = await instances.patchInstanceStageItem(input.instanceId, result.item.id, freeformPatch);
        if (!row) throw new Error("Элемент не найден");
      }
      diff.itemsAdded += 1;
    } else if (create.kind === "test_set_expand") {
      const stageId = resolveBatchId(create.stageId, idMap, "Элемент");
      const stage = detail.stages.find((s) => s.id === stageId);
      if (!stage) throw new Error("Этап не найден");
      const testsGroup = stage.groups.find((g) => g.systemKind === "tests");
      if (!testsGroup) throw new Error("Системная группа «Тестирование» не найдена");
      let sortOrder = stage.items.reduce((m, i) => Math.max(m, i.sortOrder), -1);
      for (const line of create.items) {
        await itemRefs.assertItemRefExists("clinical_test", line.itemRefId);
        sortOrder += 1;
        const resolvedGroupId = line.groupId
          ? resolveBatchId(line.groupId, idMap, "Группа")
          : testsGroup.id;
        const grp = stage.groups.find((g) => g.id === resolvedGroupId);
        assertTreatmentProgramStageItemFitsSystemGroup(grp, "clinical_test");
        const row = await instances.addInstanceStageItem(input.instanceId, stageId, {
          itemType: "clinical_test",
          itemRefId: line.itemRefId,
          sortOrder,
          comment: null,
          settings: null,
          snapshot: await catalogSnapshotForEditorBatch(snapshots, "clinical_test", line.itemRefId),
          status: line.status ?? "active",
          groupId: resolvedGroupId,
        });
        if (!row) throw new Error("Не удалось добавить элемент");
        idMap.set(line.clientId, row.id);
        if (line.localComment !== undefined) {
          await instances.updateStageItemLocalComment(input.instanceId, row.id, line.localComment);
        }
        diff.itemsAdded += 1;
      }
    } else {
      const stageId = resolveBatchId(create.stageId, idMap, "Элемент");
      const stage = detail.stages.find((s) => s.id === stageId);
      if (!stage) throw new Error("Этап не найден");
      let sortOrder = stage.items.reduce((m, i) => Math.max(m, i.sortOrder), -1);
      for (const line of create.items) {
        await itemRefs.assertItemRefExists("exercise", line.itemRefId);
        sortOrder += 1;
        const groupId = resolveBatchId(line.groupId ?? create.groupId, idMap, "Группа");
        const grp = stage.groups.find((g) => g.id === groupId);
        assertTreatmentProgramStageItemFitsSystemGroup(grp, "exercise");
        const settings = line.loadSettings ? mergeLoadSettings(null, line.loadSettings) : null;
        const row = await instances.addInstanceStageItem(input.instanceId, stageId, {
          itemType: "exercise",
          itemRefId: line.itemRefId,
          sortOrder,
          comment: null,
          settings,
          snapshot: await catalogSnapshotForEditorBatch(snapshots, "exercise", line.itemRefId),
          status: line.status ?? "active",
          groupId,
        });
        if (!row) throw new Error("Не удалось добавить элемент");
        idMap.set(line.clientId, row.id);
        if (line.localComment !== undefined) {
          await instances.updateStageItemLocalComment(input.instanceId, row.id, line.localComment);
        }
        diff.itemsAdded += 1;
      }
    }
    detail = (await instances.getInstanceById(input.instanceId))!;
  }

  for (const [stageIdRaw, patch] of Object.entries(input.draft.stageMetadata)) {
    const stageId = resolveBatchId(stageIdRaw, idMap, "Этап");
    const norm: UpdateTreatmentProgramInstanceStageMetadataInput = {};
    if (patch.title !== undefined) {
      const t = patch.title.trim();
      if (!t) throw new Error("Название этапа не может быть пустым");
      norm.title = t;
    }
    if (patch.description !== undefined) {
      norm.description = patch.description === null ? null : patch.description.trim() || null;
    }
    if (patch.goals !== undefined) norm.goals = patch.goals === null ? null : patch.goals.trim() || null;
    if (patch.objectives !== undefined) {
      norm.objectives = patch.objectives === null ? null : patch.objectives.trim() || null;
    }
    if (patch.expectedDurationDays !== undefined) norm.expectedDurationDays = patch.expectedDurationDays;
    if (patch.expectedDurationText !== undefined) {
      norm.expectedDurationText =
        patch.expectedDurationText === null ? null : patch.expectedDurationText.trim() || null;
    }
    if (Object.keys(norm).length === 0) continue;
    const row = await instances.updateInstanceStageMetadata(input.instanceId, stageId, norm);
    if (!row) throw new Error("Этап не найден");
    diff.stagesMetadataUpdated += 1;
  }

  for (const [groupIdRaw, patch] of Object.entries(input.draft.groupPatches)) {
    const groupId = resolveBatchId(groupIdRaw, idMap, "Группа");
    const grp = detail.stages.flatMap((s) => s.groups).find((g) => g.id === groupId);
    const isSystemGroup = grp?.systemKind === "recommendations" || grp?.systemKind === "tests";
    const norm: UpdateTreatmentProgramInstanceStageGroupInput = {};
    if (patch.title !== undefined && !isSystemGroup) {
      const t = patch.title.trim();
      if (!t) throw new Error("Название группы не может быть пустым");
      norm.title = t;
    }
    if (patch.description !== undefined && !isSystemGroup) {
      norm.description = patch.description === null ? null : patch.description.trim() || null;
    }
    if (patch.scheduleText !== undefined && !isSystemGroup) {
      norm.scheduleText = patch.scheduleText === null ? null : patch.scheduleText.trim() || null;
    }
    if (Object.keys(norm).length === 0) continue;
    const row = await instances.updateInstanceStageGroup(input.instanceId, groupId, norm);
    if (!row) throw new Error("Группа не найдена");
    diff.groupsMetadataUpdated += 1;
  }

  detail = (await instances.getInstanceById(input.instanceId))!;

  for (const [itemIdRaw, patch] of Object.entries(input.draft.itemStructuralPatches)) {
    if (isInstanceEditorBatchClientId(itemIdRaw)) continue;
    const itemId = resolveBatchId(itemIdRaw, idMap, "Элемент");
    const item = detail.stages.flatMap((s) => s.items).find((i) => i.id === itemId);
    if (!item) throw new Error("Элемент не найден");

    if (patch.replace) {
      await assertStageItemAllowsStructuralChange(item, testAttempts);
      await itemRefs.assertItemRefExists(patch.replace.itemType, patch.replace.itemRefId);
      const row = await instances.replaceInstanceStageItem(input.instanceId, itemId, {
        itemType: patch.replace.itemType,
        itemRefId: patch.replace.itemRefId,
        snapshot: await catalogSnapshotForEditorBatch(
          snapshots,
          patch.replace.itemType,
          patch.replace.itemRefId,
        ),
      });
      if (!row) throw new Error("Не удалось заменить элемент");
      diff.itemsStructuralUpdated += 1;
      continue;
    }

    const itemPatch: {
      status?: "active" | "disabled";
      isActionable?: boolean | null;
      groupId?: string | null;
    } = {};

    if (patch.status !== undefined) itemPatch.status = patch.status;
    if (patch.isActionable !== undefined) {
      if (item.itemType !== "recommendation") {
        throw new Error("Режим выполнения задаётся только для рекомендаций");
      }
      itemPatch.isActionable = patch.isActionable;
    }
    if (patch.groupId !== undefined) {
      const stage = detail.stages.find((s) => s.id === item.stageId);
      if (!stage) throw new Error("Этап не найден");
      let nextGroupId = resolveOptionalBatchId(patch.groupId, idMap, "Группа") ?? null;
      if (isStageZero(stage)) {
        if (item.itemType !== "recommendation") {
          throw new Error("На этапе «Общие рекомендации» разрешены только рекомендации");
        }
        if (patch.groupId != null) {
          throw new Error("На этапе «Общие рекомендации» элементы не привязываются к группам");
        }
        nextGroupId = null;
      } else if (!nextGroupId) {
        if (item.itemType === "recommendation" || item.itemType === "clinical_test") {
          const want = item.itemType === "recommendation" ? "recommendations" : "tests";
          const sg = stage.groups.find((g) => g.systemKind === want);
          if (!sg) throw new Error("Системная группа этапа не найдена");
          nextGroupId = sg.id;
        } else {
          throw new Error("Выберите группу для этого типа элемента");
        }
      } else {
        const g = stage.groups.find((gr) => gr.id === nextGroupId);
        assertTreatmentProgramStageItemFitsSystemGroup(g, item.itemType);
      }
      itemPatch.groupId = nextGroupId;
    }

    if (Object.keys(itemPatch).length === 0) continue;
    const row = await instances.patchInstanceStageItem(input.instanceId, itemId, itemPatch);
    if (!row) throw new Error("Элемент не найден");
    diff.itemsStructuralUpdated += 1;
  }

  detail = (await instances.getInstanceById(input.instanceId))!;

  for (const [itemIdRaw] of Object.entries(input.draft.itemDeletes)) {
    if (isInstanceEditorBatchClientId(itemIdRaw)) continue;
    const itemId = resolveBatchId(itemIdRaw, idMap, "Элемент");
    const item = detail.stages.flatMap((s) => s.items).find((i) => i.id === itemId);
    if (!item) continue;
    await assertStageItemAllowsStructuralChange(item, testAttempts);
    const ok = await instances.deleteInstanceStageItem(input.instanceId, itemId);
    if (!ok) throw new Error("Элемент не найден");
    diff.itemsRemoved += 1;
  }

  detail = (await instances.getInstanceById(input.instanceId))!;

  for (const [groupIdRaw] of Object.entries(input.draft.groupHides)) {
    if (isInstanceEditorBatchClientId(groupIdRaw)) continue;
    const groupId = resolveBatchId(groupIdRaw, idMap, "Группа");
    const gr = detail.stages.flatMap((s) => s.groups).find((g) => g.id === groupId);
    if (!gr) continue;
    if (gr.systemKind === "recommendations" || gr.systemKind === "tests") {
      throw new Error("Системную группу нельзя скрыть");
    }
    const itemsInGroup = detail.stages.flatMap((s) => s.items).filter((it) => it.groupId === groupId);
    for (const it of itemsInGroup) {
      if (it.status === "active") {
        await instances.patchInstanceStageItem(input.instanceId, it.id, { status: "disabled" });
      }
    }
    const ok = await instances.deleteInstanceStageGroup(input.instanceId, groupId);
    if (!ok) throw new Error("Группа не найдена");
    diff.groupsHidden += 1;
  }

  detail = (await instances.getInstanceById(input.instanceId))!;

  if (input.draft.stageOrder) {
    const orderedStageIds = input.draft.stageOrder.map((id, i) =>
      resolveBatchId(id, idMap, `Этап ${i + 1}`),
    );
    const stageZero = detail.stages.find((s) => s.sortOrder === 0);
    if (stageZero && orderedStageIds[0] !== stageZero.id) {
      throw new Error("Этап «Общие рекомендации» должен оставаться первым");
    }
    const ok = await instances.reorderInstanceStages(input.instanceId, orderedStageIds);
    if (!ok) throw new Error("Некорректный порядок этапов");
    diff.stagesReordered = true;
    detail = (await instances.getInstanceById(input.instanceId))!;
  }

  for (const [stageIdRaw, orderedGroupIds] of Object.entries(input.draft.groupReorders)) {
    const stageId = resolveBatchId(stageIdRaw, idMap, "Этап");
    const resolved = orderedGroupIds.map((id, i) => resolveBatchId(id, idMap, `Группа ${i + 1}`));
    const ok = await instances.reorderInstanceStageGroups(input.instanceId, stageId, resolved);
    if (!ok) throw new Error("Некорректный порядок групп этапа");
    diff.groupsReordered = true;
  }

  for (const [stageIdRaw, orderedItemIds] of Object.entries(input.draft.itemReorders)) {
    const stageId = resolveBatchId(stageIdRaw, idMap, "Этап");
    const resolved = orderedItemIds.map((id, i) => resolveBatchId(id, idMap, `Элемент ${i + 1}`));
    const ok = await instances.reorderInstanceStageItems(input.instanceId, stageId, resolved);
    if (!ok) throw new Error("Некорректный порядок элементов этапа");
    diff.itemsReordered = true;
  }

  for (const [itemIdRaw, patch] of Object.entries(input.draft.itemPatches)) {
    if (isInstanceEditorBatchClientId(itemIdRaw)) continue;
    const itemId = resolveBatchId(itemIdRaw, idMap, "Элемент");
    if (patch.localComment !== undefined) {
      const row = await instances.updateStageItemLocalComment(
        input.instanceId,
        itemId,
        patch.localComment,
      );
      if (!row) throw new Error("Элемент не найден");
      diff.itemsMetadataUpdated += 1;
    }
    if (patch.loadSettings) {
      const item = detail.stages.flatMap((s) => s.items).find((i) => i.id === itemId);
      if (!item) throw new Error("Элемент не найден");
      if (item.itemType !== "exercise") {
        throw new Error("Нагрузку можно менять только для упражнений");
      }
      const nextSettings = mergeLoadSettings(
        item.settings as Record<string, unknown> | null,
        patch.loadSettings,
      );
      const row = await instances.patchInstanceStageItem(input.instanceId, itemId, {
        settings: nextSettings,
      });
      if (!row) throw new Error("Элемент не найден");
      diff.itemsMetadataUpdated += 1;
    }
  }

  detail = (await instances.getInstanceById(input.instanceId))!;
  if (!detail) throw new Error("Программа не найдена");
  if (isProgramChangedDiffEmpty(diff)) {
    return { detail, diff };
  }
  return { detail, diff };
  });
}
