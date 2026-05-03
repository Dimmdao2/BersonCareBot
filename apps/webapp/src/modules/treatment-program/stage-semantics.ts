import type {
  TreatmentProgramInstanceDetail,
  TreatmentProgramInstanceStageItemRow,
  TreatmentProgramInstanceStageRow,
} from "./types";

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
  return stage.items.some((it) => isInstanceStageItemActiveForPatient(it));
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
