import { DateTime } from "luxon";
import type {
  TreatmentProgramInstanceDetail,
  TreatmentProgramInstanceStageItemRow,
  TreatmentProgramInstanceStageRow,
} from "./types";

/** Этап экземпляра в read-model detail (группы + элементы). */
export type TreatmentProgramInstanceDetailStageRow = TreatmentProgramInstanceDetail["stages"][number];

/** Этап 0 «Общие рекомендации»: `sort_order = 0` на этапе экземпляра, вне FSM автозавершения. */
export function isStageZero(stage: Pick<TreatmentProgramInstanceStageRow, "sortOrder">): boolean {
  return stage.sortOrder === 0;
}

type ItemSemanticsFields = Pick<
  TreatmentProgramInstanceStageItemRow,
  "itemType" | "isActionable" | "status"
>;

/** Постоянная рекомендация: только instance-level `is_actionable === false` (O4). */
export function isPersistentRecommendation(item: ItemSemanticsFields): boolean {
  return item.itemType === "recommendation" && item.isActionable === false;
}

/** Учитывается ли элемент в автозавершении этапа (исключая disabled и persistent). */
export function isCompletableForStageProgress(item: ItemSemanticsFields): boolean {
  if (item.status === "disabled") return false;
  if (isPersistentRecommendation(item)) return false;
  return true;
}

export function isInstanceStageItemActiveForPatient(item: ItemSemanticsFields): boolean {
  return item.status !== "disabled";
}

/**
 * Элементы набора тестов (`test_set`) на списках программы у пациента (detail, страница этапа) не показываются;
 * прохождение — на странице тестирования. В **модалке «Состав этапа»** набор разворачивается в отдельные тесты —
 * см. `isInstanceStageItemShownInPatientCompositionModal`.
 */
export function isInstanceStageItemShownOnPatientProgramSurfaces(
  item: Pick<TreatmentProgramInstanceStageItemRow, "itemType" | "status" | "isActionable">,
): boolean {
  if (!isInstanceStageItemActiveForPatient(item)) return false;
  return item.itemType !== "test_set";
}

/** Модалка «Состав этапа» (timeline): все активные типы, включая `test_set` (строки — отдельные тесты снимка). */
export function isInstanceStageItemShownInPatientCompositionModal(
  item: Pick<TreatmentProgramInstanceStageItemRow, "itemType" | "status" | "isActionable">,
): boolean {
  return isInstanceStageItemActiveForPatient(item);
}

/**
 * Пациентский экран плана: не рендерить секцию этапа целиком, если нет видимых пунктов и нет
 * сообщения о недоступности этапа (locked/skipped для не–этапа-0), и нет блока A1 (цель/задачи/срок).
 */
export function patientStageSectionShouldRender(
  stage: Pick<
    TreatmentProgramInstanceStageRow,
    | "status"
    | "goals"
    | "objectives"
    | "expectedDurationDays"
    | "expectedDurationText"
  > & {
    items: Array<ItemSemanticsFields>;
  },
  ignoreStageLockForContent: boolean,
): boolean {
  const contentBlocked =
    !ignoreStageLockForContent && (stage.status === "locked" || stage.status === "skipped");
  if (contentBlocked) return true;
  if (
    Boolean(stage.goals?.trim()) ||
    Boolean(stage.objectives?.trim()) ||
    stage.expectedDurationDays != null ||
    Boolean(stage.expectedDurationText?.trim())
  ) {
    return true;
  }
  return stage.items.some((it) => isInstanceStageItemShownOnPatientProgramSurfaces(it));
}

/** A5: бейдж «Новое» — только активный элемент, `last_viewed_at` ещё null, этап не заблокирован для контента. */
export function patientStageItemShowsNewBadge(
  item: Pick<TreatmentProgramInstanceStageItemRow, "itemType" | "isActionable" | "status" | "lastViewedAt">,
  contentBlockedForStage: boolean,
): boolean {
  if (contentBlockedForStage) return false;
  if (!isInstanceStageItemActiveForPatient(item)) return false;
  return item.lastViewedAt == null;
}

/**
 * Разбиение этапов для patient detail (1.1a): этап 0, «живой» pipeline и архив завершённых/пропущенных.
 */
export function splitPatientProgramStagesForDetailUi(stages: TreatmentProgramInstanceDetailStageRow[]): {
  stageZero: TreatmentProgramInstanceDetailStageRow[];
  archive: TreatmentProgramInstanceDetailStageRow[];
  pipeline: TreatmentProgramInstanceDetailStageRow[];
} {
  const ordered = [...stages].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  const stageZero = ordered.filter(isStageZero);
  const nonZero = ordered.filter((s) => !isStageZero(s));
  const archive = nonZero.filter((s) => s.status === "completed" || s.status === "skipped");
  const pipeline = nonZero.filter((s) => s.status !== "completed" && s.status !== "skipped");
  return { stageZero, archive, pipeline };
}

/** Текущий рабочий этап: сначала `in_progress`, иначе первый `available`, иначе первый `locked` (ожидание). */
export function selectCurrentWorkingStageForPatientDetail(
  pipeline: TreatmentProgramInstanceDetailStageRow[],
): TreatmentProgramInstanceDetailStageRow | null {
  const inProg = pipeline.find((s) => s.status === "in_progress");
  if (inProg) return inProg;
  const avail = pipeline.find((s) => s.status === "available");
  if (avail) return avail;
  const locked = pipeline.find((s) => s.status === "locked");
  return locked ?? null;
}

/**
 * Ожидаемая дата контроля этапа: `started_at` + `expected_duration_days` (календарные сутки от момента старта этапа).
 * Только если оба поля заданы и дни неотрицательны.
 */
export function expectedStageControlDateIso(
  stage: Pick<TreatmentProgramInstanceStageRow, "startedAt" | "expectedDurationDays">,
): string | null {
  if (stage.startedAt == null || stage.expectedDurationDays == null) return null;
  const days = stage.expectedDurationDays;
  if (!Number.isFinite(days) || days < 0) return null;
  const dt = DateTime.fromISO(stage.startedAt, { zone: "utc" });
  if (!dt.isValid) return null;
  return dt.plus({ days }).toISO();
}

/**
 * Patient HTTP/RSC read model (A2-READ-01): `disabled` rows stay in DB and doctor views;
 * пациентский API и RSC не отдают отключённые элементы в `stages[].items`.
 */
export function omitDisabledInstanceStageItemsForPatientApi(
  detail: TreatmentProgramInstanceDetail,
): TreatmentProgramInstanceDetail {
  return {
    ...detail,
    stages: detail.stages.map((stage) => {
      const items = stage.items.filter((it) => isInstanceStageItemActiveForPatient(it));
      const visibleGroupIds = new Set(
        items.map((it) => it.groupId).filter((gid): gid is string => gid !== null && gid !== ""),
      );
      const groups = stage.groups.filter((g) => visibleGroupIds.has(g.id));
      return { ...stage, items, groups };
    }),
  };
}
