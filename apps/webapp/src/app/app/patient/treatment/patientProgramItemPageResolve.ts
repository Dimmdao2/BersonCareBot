import type { TreatmentProgramInstanceDetail } from "@/modules/treatment-program/types";
import {
  isInstanceStageItemActiveForPatient,
  isInstanceStageItemShownOnPatientProgramSurfaces,
  isPersistentRecommendation,
  isTreatmentProgramInstanceSystemStageGroup,
  patientInstanceSystemGroupHasVisibleItems,
  sortDoctorInstanceStageGroupsForDisplay,
  splitPatientProgramStagesForDetailUi,
} from "@/modules/treatment-program/stage-semantics";
import { flatOrderedProgramCompositionItemIds } from "@/app/app/patient/treatment/programCompositionOrder";
import {
  flatExecIds,
  flatRecReadIds,
  flatTestSlots,
  type PatientProgramTestNavSlot,
} from "@/app/app/patient/treatment/patientProgramItemNavLists";

type Stage = TreatmentProgramInstanceDetail["stages"][number];
type StageItem = Stage["items"][number];

export type PatientProgramItemNavMode =
  | "default"
  | "program"
  | "exec"
  | "rec-stage"
  | "rec-zero"
  | "rec-persist"
  | "rec-read"
  | "tests";

export function parsePatientProgramItemNavMode(raw: unknown): PatientProgramItemNavMode {
  const s = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "";
  if (
    s === "program" ||
    s === "exec" ||
    s === "rec-stage" ||
    s === "rec-zero" ||
    s === "rec-persist" ||
    s === "rec-read" ||
    s === "tests"
  )
    return s;
  return "default";
}

function sortByOrderThenId<T extends { sortOrder: number; id: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

function findStageContainingItem(detail: TreatmentProgramInstanceDetail, itemId: string): Stage | null {
  for (const st of detail.stages) {
    if (st.items.some((it) => it.id === itemId)) return st;
  }
  return null;
}

function flatIdsBodyLike(stage: Stage, itemInteraction: "full" | "readOnly"): string[] {
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
  for (const g of sortedGroups) {
    const gItems = sortByOrderThenId(visibleItems.filter((it) => it.groupId === g.id));
    for (const it of gItems) ids.push(it.id);
  }
  for (const it of ungroupedItems) ids.push(it.id);
  return ids;
}

function itemInteractionForStage(stage: Stage): "full" | "readOnly" {
  if (stage.status === "completed" || stage.status === "skipped") return "readOnly";
  return "full";
}

export type ResolvedPatientProgramItemPage = {
  stage: Stage;
  item: StageItem;
  flatOrderedIds: string[];
  contentBlocked: boolean;
  itemInteraction: "full" | "readOnly";
  /** Только для `nav=tests`: слоты (itemId набора + testId) в порядке обхода. */
  testSlots?: PatientProgramTestNavSlot[];
  /** Только для `nav=tests`: канонический testId для текущего URL (если передан и валиден). */
  resolvedTestId?: string | null;
};

/**
 * Данные для страницы пункта программы: этап, элемент, порядок prev/next и режим взаимодействия.
 * `nav` задаёт тот же порядок, что у соответствующего списка в UI (см. query `nav` на маршруте item).
 */
export function resolvePatientProgramItemPage(params: {
  detail: TreatmentProgramInstanceDetail;
  itemId: string;
  nav: PatientProgramItemNavMode;
  /** Рабочий этап (вкладка «Рекомендации» / hero) — для `rec-stage`, `rec-read`, `tests`. */
  currentWorkingStage: Stage | null;
  /** Для `nav=tests`: uuid теста из снимка (опционально; RSC может нормализовать URL). */
  testId?: string | null;
}): ResolvedPatientProgramItemPage | null {
  const { detail, itemId, nav, currentWorkingStage, testId: testIdParam } = params;
  const stage = findStageContainingItem(detail, itemId);
  if (!stage) return null;
  const item = stage.items.find((it) => it.id === itemId);
  if (!item) return null;

  const ignoreStageLockForContent = stage.sortOrder === 0;
  const contentBlocked =
    !ignoreStageLockForContent && (stage.status === "locked" || stage.status === "skipped");

  let flatOrderedIds: string[] = [];
  let itemInteraction: "full" | "readOnly" = itemInteractionForStage(stage);
  let testSlots: PatientProgramTestNavSlot[] | undefined;
  let resolvedTestId: string | null | undefined;

  const { stageZero } = splitPatientProgramStagesForDetailUi(detail.stages);

  if (nav === "program") {
    flatOrderedIds = flatOrderedProgramCompositionItemIds(stage);
    itemInteraction = "full";
    if (!flatOrderedIds.includes(itemId)) return null;
  } else if (nav === "exec") {
    flatOrderedIds = flatExecIds(stage, itemInteraction);
    if (!flatOrderedIds.includes(itemId)) {
      flatOrderedIds = flatExecIds(stage, itemInteraction === "readOnly" ? "full" : "readOnly");
    }
    if (!flatOrderedIds.includes(itemId)) return null;
  } else if (nav === "rec-stage") {
    if (!currentWorkingStage) return null;
    flatOrderedIds = sortByOrderThenId(currentWorkingStage.items.filter((it) => isPersistentRecommendation(it))).map(
      (it) => it.id,
    );
    itemInteraction = "readOnly";
    if (!flatOrderedIds.includes(itemId)) return null;
  } else if (nav === "rec-zero") {
    const rows: StageItem[] = [];
    for (const st of stageZero) {
      for (const it of sortByOrderThenId(st.items)) {
        if (isInstanceStageItemShownOnPatientProgramSurfaces(it)) rows.push(it);
      }
    }
    flatOrderedIds = rows.map((it) => it.id);
    itemInteraction = "readOnly";
    if (!flatOrderedIds.includes(itemId)) return null;
  } else if (nav === "rec-persist") {
    flatOrderedIds = sortByOrderThenId(stage.items.filter((it) => isPersistentRecommendation(it))).map((it) => it.id);
    itemInteraction = "readOnly";
    if (!flatOrderedIds.includes(itemId)) return null;
  } else if (nav === "rec-read") {
    flatOrderedIds = flatRecReadIds(currentWorkingStage, stageZero);
    itemInteraction = "readOnly";
    if (!flatOrderedIds.includes(itemId)) return null;
  } else if (nav === "tests") {
    if (!currentWorkingStage) return null;
    testSlots = flatTestSlots(currentWorkingStage);
    if (testSlots.length === 0) return null;
    if (item.itemType !== "test_set") return null;
    if (!currentWorkingStage.items.some((it) => it.id === item.id)) return null;
    const setHasSlots = testSlots.some((s) => s.itemId === item.id);
    if (!setHasSlots) return null;
    const tid = typeof testIdParam === "string" ? testIdParam.trim() : "";
    if (tid) {
      const ok = testSlots.some((s) => s.itemId === item.id && s.testId === tid);
      if (!ok) return null;
      resolvedTestId = tid;
    } else {
      resolvedTestId = null;
    }
    flatOrderedIds = [];
    itemInteraction = "full";
  } else {
    flatOrderedIds = flatIdsBodyLike(stage, itemInteraction);
    if (!flatOrderedIds.includes(itemId)) {
      flatOrderedIds = flatIdsBodyLike(stage, itemInteraction === "readOnly" ? "full" : "readOnly");
    }
    if (!flatOrderedIds.includes(itemId)) flatOrderedIds = [itemId];
  }

  return {
    stage,
    item,
    flatOrderedIds,
    contentBlocked,
    itemInteraction,
    ...(testSlots != null ? { testSlots } : {}),
    ...(resolvedTestId !== undefined ? { resolvedTestId } : {}),
  };
}
