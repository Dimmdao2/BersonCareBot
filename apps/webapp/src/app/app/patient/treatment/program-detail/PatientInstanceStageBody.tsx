"use client";

import type { ReactNode } from "react";
import type { TreatmentProgramInstanceDetail } from "@/modules/treatment-program/types";
import {
  isInstanceStageItemActiveForPatient,
  isInstanceStageItemShownOnPatientProgramSurfaces,
  isTreatmentProgramInstanceSystemStageGroup,
  patientInstanceSystemGroupHasVisibleItems,
  sortDoctorInstanceStageGroupsForDisplay,
} from "@/modules/treatment-program/stage-semantics";
import { routePaths } from "@/app-layer/routes/paths";
import { type PatientPlanTab } from "@/app/app/patient/treatment/patientPlanTab";
import { cn } from "@/lib/utils";
import {
  patientBodyTextClass,
  patientMutedTextClass,
  patientSectionTitleClass,
} from "@/shared/ui/patientVisual";
import { patientTreatmentProgramListItemClass } from "@/app/app/patient/treatment/program-detail/patientTreatmentProgramListItemClass";
import { sortByOrderThenId } from "@/app/app/patient/treatment/program-detail/patientPlanDetailFormatters";
import { PatientStageHeaderFields } from "@/app/app/patient/treatment/program-detail/PatientStageHeaderFields";
import { PatientInstanceStageItemCard } from "@/app/app/patient/treatment/program-detail/PatientInstanceStageItemCard";

export function PatientInstanceStageBody(props: {
  instanceId: string;
  stage: TreatmentProgramInstanceDetail["stages"][number];
  base: string;
  busy: string | null;
  setBusy: (v: string | null) => void;
  setError: (v: string | null) => void;
  refresh: () => Promise<void>;
  /** Этап 0: контент элементов доступен независимо от статуса «заблокирован» этапа. */
  ignoreStageLockForContent: boolean;
  surfaceClass: string;
  heading: ReactNode;
  doneItemIds: string[];
  onDoneItemIds: (ids: string[]) => void;
  /** Агрегат `doneTodayCountByItemId` из checklist-today для строк этапа. */
  todayCountByStageItemId?: Readonly<Record<string, number>>;
  /**
   * Вертикальный ритм как у блока «Этапы программы» (рекомендации в коллапсе на detail).
   */
  stackVariant?: "default" | "likeStagesTimeline";
  /** Архив этапа: только список без действий. */
  itemInteraction?: "full" | "readOnly";
  /** Не показывать «Описание этапа» и текст описания этапа (этап 0 / рекомендации). */
  hideStageDescription?: boolean;
  /** Вкладка плана для `planTab` в ссылках на пункт (`/item/...`). */
  itemLinksPlanTab?: PatientPlanTab | null;
  /** Пауза перед повторным «Выполнено» у простых пунктов (мин), из админских настроек. */
  planItemDoneRepeatCooldownMinutes: number;
}) {
  const {
    instanceId,
    stage,
    base,
    busy,
    setBusy,
    setError,
    refresh,
    ignoreStageLockForContent,
    surfaceClass,
    heading,
    doneItemIds,
    onDoneItemIds,
    todayCountByStageItemId,
    stackVariant = "default",
    itemInteraction = "full",
    hideStageDescription = false,
    itemLinksPlanTab = null,
    planItemDoneRepeatCooldownMinutes,
  } = props;
  const likeStages = stackVariant === "likeStagesTimeline";
  const contentBlocked =
    !ignoreStageLockForContent && (stage.status === "locked" || stage.status === "skipped");
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

  return (
    <section className={surfaceClass}>
      {heading != null ? (
        <div className="mb-3 flex flex-wrap items-baseline gap-2">{heading}</div>
      ) : null}
      <PatientStageHeaderFields
        stage={stage}
        compactSpacing={likeStages}
        hideDescription={hideStageDescription}
      />
      {contentBlocked ? (
        <p className={patientMutedTextClass}>Этап откроется после завершения предыдущего или по решению врача.</p>
      ) : null}
      <div className={cn("m-0 p-0", likeStages ? "space-y-1.5" : "space-y-3")}>
        {sortedGroups.map((g) => {
          const gItems = sortByOrderThenId(visibleItems.filter((it) => it.groupId === g.id));
          return (
            <details
              key={g.id}
              className={cn(
                patientTreatmentProgramListItemClass,
                "border-[var(--patient-border)]/80",
                likeStages ? "bg-[var(--patient-card-bg)]" : "bg-[var(--patient-color-primary-soft)]/5",
              )}
              open
            >
              <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                <span className="text-sm font-semibold text-foreground">{g.title}</span>
                {g.scheduleText?.trim() ? (
                  <span className={cn(patientMutedTextClass, "mt-1 block text-xs")}>
                    {g.scheduleText.trim()}
                  </span>
                ) : null}
              </summary>
              {g.description?.trim() ? (
                <p className={cn(patientBodyTextClass, "mt-2 whitespace-pre-wrap text-sm")}>{g.description.trim()}</p>
              ) : null}
              <ul className={cn("m-0 list-none p-0", likeStages ? "mt-1.5 space-y-1.5" : "mt-2 space-y-3")}>
                {gItems.map((item) => (
                  <PatientInstanceStageItemCard
                    key={item.id}
                    instanceId={instanceId}
                    stage={stage}
                    groupTitle={g.title}
                    item={item}
                    base={base}
                    busy={busy}
                    setBusy={setBusy}
                    setError={setError}
                    refresh={refresh}
                    contentBlocked={contentBlocked}
                    itemInteraction={itemInteraction}
                    doneItemIds={doneItemIds}
                    onDoneItemIds={onDoneItemIds}
                    todayChecklistDoneCount={todayCountByStageItemId?.[item.id]}
                    neutralItemChrome={likeStages}
                    itemDetailHref={routePaths.patientTreatmentProgramItem(
                      instanceId,
                      item.id,
                      "exec",
                      itemLinksPlanTab ?? null,
                    )}
                    planItemDoneRepeatCooldownMinutes={planItemDoneRepeatCooldownMinutes}
                  />
                ))}
              </ul>
            </details>
          );
        })}
        {ungroupedItems.length > 0 ? (
          <div className={likeStages ? "space-y-1.5" : "space-y-3"}>
            {sortedGroups.length > 0 ? (
              <h3 className={cn(patientSectionTitleClass, "text-sm")}>Без группы</h3>
            ) : null}
            <ul className={cn("m-0 list-none p-0", likeStages ? "space-y-1.5" : "space-y-3")}>
              {ungroupedItems.map((item) => (
                <PatientInstanceStageItemCard
                  key={item.id}
                  instanceId={instanceId}
                  stage={stage}
                  groupTitle={null}
                  item={item}
                  base={base}
                  busy={busy}
                  setBusy={setBusy}
                  setError={setError}
                  refresh={refresh}
                  contentBlocked={contentBlocked}
                  itemInteraction={itemInteraction}
                  doneItemIds={doneItemIds}
                  onDoneItemIds={onDoneItemIds}
                  todayChecklistDoneCount={todayCountByStageItemId?.[item.id]}
                  neutralItemChrome={likeStages}
                  itemDetailHref={routePaths.patientTreatmentProgramItem(
                    instanceId,
                    item.id,
                    "exec",
                    itemLinksPlanTab ?? null,
                  )}
                  planItemDoneRepeatCooldownMinutes={planItemDoneRepeatCooldownMinutes}
                />
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
