/**
 * Порядок пунктов «Программа этапа» (состав этапа на прогрессе / страница этапа).
 * Сервер-безопасный модуль — без `"use client"` (используется из RSC и из `patientProgramItemPageResolve`).
 */
import type { TreatmentProgramInstanceDetail } from "@/modules/treatment-program/types";
import {
  isInstanceStageItemShownInPatientCompositionModal,
  sortDoctorInstanceStageGroupsForDisplay,
} from "@/modules/treatment-program/stage-semantics";
import type { InstanceStageItem } from "@/app/app/patient/treatment/stageItemSnapshot";

type Stage = TreatmentProgramInstanceDetail["stages"][number];

export function sortProgramCompositionItemsByOrderThenId<T extends { sortOrder: number; id: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

/**
 * Состав «Программа этапа» — тот же набор, что «Состав этапа» на прогрессе
 * ({@link isInstanceStageItemShownInPatientCompositionModal}): без `test_set`.
 */
export function isProgramCompositionItem(item: InstanceStageItem, stage: Stage): boolean {
  return isInstanceStageItemShownInPatientCompositionModal(item, stage.groups);
}

export type ProgramCompositionSegment =
  | { kind: "item"; item: InstanceStageItem }
  | { kind: "group"; group: Stage["groups"][number]; items: InstanceStageItem[] };

/**
 * Порядок как в назначении: группы через {@link sortDoctorInstanceStageGroupsForDisplay},
 * затем все пункты без группы по `sort_order`.
 */
export function buildProgramCompositionSegments(
  stage: Stage,
  visibleProgramItems: InstanceStageItem[],
): ProgramCompositionSegment[] {
  const sortedGroups = sortDoctorInstanceStageGroupsForDisplay(stage.groups).filter((g) =>
    visibleProgramItems.some((it) => it.groupId === g.id),
  );
  const ungrouped = sortProgramCompositionItemsByOrderThenId(visibleProgramItems.filter((it) => !it.groupId));
  const out: ProgramCompositionSegment[] = [];
  for (const g of sortedGroups) {
    const gItems = sortProgramCompositionItemsByOrderThenId(visibleProgramItems.filter((it) => it.groupId === g.id));
    if (gItems.length === 0) continue;
    out.push({ kind: "group", group: g, items: gItems });
  }
  for (const it of ungrouped) {
    out.push({ kind: "item", item: it });
  }
  return out;
}

/** Порядок id элементов «программы этапа» (как на странице этапа / вкладке программы). */
export function flatOrderedProgramCompositionItemIds(stage: Stage): string[] {
  const visibleProgramItems = sortProgramCompositionItemsByOrderThenId(
    stage.items.filter((it) => isProgramCompositionItem(it, stage)),
  );
  const segments = buildProgramCompositionSegments(stage, visibleProgramItems);
  const ids: string[] = [];
  for (const seg of segments) {
    if (seg.kind === "item") ids.push(seg.item.id);
    else for (const it of seg.items) ids.push(it.id);
  }
  return ids;
}
