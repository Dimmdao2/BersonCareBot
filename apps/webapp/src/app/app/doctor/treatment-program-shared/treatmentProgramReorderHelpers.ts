import { arrayMove } from "@dnd-kit/sortable";

export function sortByOrderThenId<T extends { sortOrder: number; id: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

/** Полный порядок id этапов после DnD в pipeline (этап 0 остаётся первым). */
export function computeOrderedStageIdsAfterPipelineMove(
  allStages: Array<{ id: string; sortOrder: number }>,
  activeId: string,
  overId: string,
): string[] | null {
  const sorted = sortByOrderThenId(allStages);
  const stageZero = sorted.find((s) => s.sortOrder === 0);
  const pipeline = sorted.filter((s) => s.sortOrder > 0);
  const oldIndex = pipeline.findIndex((s) => s.id === activeId);
  const newIndex = pipeline.findIndex((s) => s.id === overId);
  if (oldIndex < 0 || newIndex < 0) return null;
  const moved = arrayMove(pipeline, oldIndex, newIndex);
  const ordered = stageZero ? [stageZero, ...moved] : moved;
  return ordered.map((s) => s.id);
}

export type StageItemLike = {
  id: string;
  sortOrder: number;
  groupId: string | null;
  itemType?: string;
};

export type StageItemDndPlan =
  | { ok: true; orderedItemIds: string[]; nextGroupId: string | null; needsGroupPatch: boolean }
  | { ok: false; error: string };

/** План DnD элемента этапа: порядок, целевая группа, нужен ли PATCH groupId. */
export function planStageItemDndReorder<T extends StageItemLike>(
  allItems: T[],
  activeId: string,
  overId: string,
  canParticipate: (item: T) => boolean,
): StageItemDndPlan {
  const result = computeStageItemReorderAfterDnd(allItems, activeId, overId, canParticipate);
  if (!result) return { ok: false, error: "invalid_reorder" };
  const active = allItems.find((i) => i.id === activeId);
  if (!active) return { ok: false, error: "not_found" };
  if (
    result.nextGroupId === null &&
    active.itemType !== "recommendation" &&
    active.itemType !== "clinical_test"
  ) {
    return { ok: false, error: "ungrouped_type" };
  }
  const currentGroupId = active.groupId ?? null;
  return {
    ok: true,
    orderedItemIds: result.orderedItemIds,
    nextGroupId: result.nextGroupId,
    needsGroupPatch: currentGroupId !== result.nextGroupId,
  };
}

/**
 * Полный список id элементов этапа после DnD между пользовательскими группами и «Без группы».
 * Элементы вне `canParticipate` сохраняют относительные позиции (системные группы).
 */
export function computeStageItemReorderAfterDnd<T extends StageItemLike>(
  allItems: T[],
  activeId: string,
  overId: string,
  canParticipate: (item: T) => boolean,
): { orderedItemIds: string[]; nextGroupId: string | null } | null {
  const sorted = sortByOrderThenId(allItems);
  const active = sorted.find((i) => i.id === activeId);
  const over = sorted.find((i) => i.id === overId);
  if (!active || !over || !canParticipate(active) || !canParticipate(over)) return null;

  const nextGroupId = over.groupId ?? null;
  const band = sorted.filter(canParticipate);
  const bandIds = band.map((i) => i.id);
  const oldIdx = bandIds.indexOf(activeId);
  const newIdx = bandIds.indexOf(overId);
  if (oldIdx < 0 || newIdx < 0) return null;
  const reorderedBand = arrayMove(bandIds, oldIdx, newIdx);
  const queue = [...reorderedBand];
  const orderedItemIds: string[] = [];
  for (const it of sorted) {
    if (canParticipate(it)) {
      const nextId = queue.shift();
      if (!nextId) return null;
      orderedItemIds.push(nextId);
    } else {
      orderedItemIds.push(it.id);
    }
  }
  if (queue.length !== 0) return null;
  return { orderedItemIds, nextGroupId };
}

function sameItemGroupKey(item: { groupId: string | null | undefined }, groupId: string | null): boolean {
  return (item.groupId ?? null) === (groupId ?? null);
}

/** Полный порядок id элементов этапа после перестановки соседей внутри одной группы. */
export function computeOrderedItemIdsAfterGroupItemAdjacentSwap<T extends StageItemLike>(
  allItems: T[],
  groupId: string | null,
  itemId: string,
  dir: -1 | 1,
  opts?: { itemInReorderBand?: (it: T) => boolean },
): string[] | null {
  const inBand = opts?.itemInReorderBand ?? (() => true);
  const groupItems = sortByOrderThenId(
    allItems.filter((it) => sameItemGroupKey(it, groupId) && inBand(it)),
  );
  const idx = groupItems.findIndex((it) => it.id === itemId);
  if (idx < 0) return null;
  const j = idx + dir;
  if (j < 0 || j >= groupItems.length) return null;
  const nextGroupOrder = [...groupItems];
  const a = nextGroupOrder[idx]!;
  const b = nextGroupOrder[j]!;
  nextGroupOrder[idx] = b;
  nextGroupOrder[j] = a;
  const queue = nextGroupOrder.map((it) => it.id);
  const allSorted = sortByOrderThenId(allItems);
  const out: string[] = [];
  for (const it of allSorted) {
    if (sameItemGroupKey(it, groupId) && inBand(it)) {
      const nextId = queue.shift();
      if (!nextId) return null;
      out.push(nextId);
    } else {
      out.push(it.id);
    }
  }
  if (queue.length !== 0) return null;
  return out;
}
