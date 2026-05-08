/**
 * Порядок id для навигации на странице пункта плана (пациент).
 * Сервер-безопасный модуль — без `"use client"`.
 */
import type { TreatmentProgramInstanceDetail } from "@/modules/treatment-program/types";
import {
  isInstanceStageItemActiveForPatient,
  isInstanceStageItemShownOnPatientProgramSurfaces,
  isPersistentRecommendation,
  isTreatmentProgramInstanceSystemStageGroup,
  patientInstanceSystemGroupHasVisibleItems,
  sortDoctorInstanceStageGroupsForDisplay,
} from "@/modules/treatment-program/stage-semantics";
import { parseTestSetSnapshotTests } from "@/modules/treatment-program/testSetSnapshotView";

type Stage = TreatmentProgramInstanceDetail["stages"][number];
type StageItem = Stage["items"][number];

function sortByOrderThenId<T extends { sortOrder: number; id: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

/** Выполняемые пункты: без клинических тестов (отдельная навигация) и без невыполняемых (persistent) рекомендаций; порядок как у «тела этапа». */
export function flatExecIds(stage: Stage, itemInteraction: "full" | "readOnly"): string[] {
  const visibleItems = stage.items.filter((it) =>
    itemInteraction === "readOnly"
      ? isInstanceStageItemActiveForPatient(it)
      : isInstanceStageItemShownOnPatientProgramSurfaces(it),
  );
  const sortedGroups = sortDoctorInstanceStageGroupsForDisplay(stage.groups).filter((g) => {
    if (!isTreatmentProgramInstanceSystemStageGroup(g)) {
      return visibleItems.some((it) => it.groupId === g.id);
    }
    return patientInstanceSystemGroupHasVisibleItems({ group: g, items: visibleItems });
  });
  const ungroupedItems = sortByOrderThenId(visibleItems.filter((it) => !it.groupId));
  const ids: string[] = [];
  const include = (it: StageItem) =>
    it.itemType !== "clinical_test" && !isPersistentRecommendation(it);
  for (const g of sortedGroups) {
    const gItems = sortByOrderThenId(visibleItems.filter((it) => it.groupId === g.id));
    for (const it of gItems) {
      if (include(it)) ids.push(it.id);
    }
  }
  for (const it of ungroupedItems) {
    if (include(it)) ids.push(it.id);
  }
  return ids;
}

/**
 * Единый список невыполняемых рекомендаций для вкладки «Рекомендации»:
 * сначала persistent текущего рабочего этапа, затем persistent этапов 0 (в порядке этапов).
 */
export function flatRecReadIds(currentWorkingStage: Stage | null, stageZeroStages: Stage[]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  if (currentWorkingStage) {
    for (const it of sortByOrderThenId(currentWorkingStage.items.filter((i) => isPersistentRecommendation(i)))) {
      if (!seen.has(it.id)) {
        seen.add(it.id);
        ids.push(it.id);
      }
    }
  }
  for (const st of stageZeroStages) {
    for (const it of sortByOrderThenId(st.items.filter((i) => isPersistentRecommendation(i)))) {
      if (!isInstanceStageItemActiveForPatient(it)) continue;
      if (!seen.has(it.id)) {
        seen.add(it.id);
        ids.push(it.id);
      }
    }
  }
  return ids;
}

export type PatientProgramTestNavSlot = { itemId: string; testId: string };

/** Плоский список тестов: активные `clinical_test` рабочего этапа; по одному слоту на тест из снимка. */
export function flatTestSlots(currentWorkingStage: Stage | null): PatientProgramTestNavSlot[] {
  if (!currentWorkingStage) return [];
  const testItems = sortByOrderThenId(
    currentWorkingStage.items.filter(
      (it) => it.itemType === "clinical_test" && isInstanceStageItemActiveForPatient(it),
    ),
  );
  const out: PatientProgramTestNavSlot[] = [];
  for (const it of testItems) {
    const snap = it.snapshot as Record<string, unknown>;
    for (const line of parseTestSetSnapshotTests(snap)) {
      out.push({ itemId: it.id, testId: line.testId });
    }
  }
  return out;
}
