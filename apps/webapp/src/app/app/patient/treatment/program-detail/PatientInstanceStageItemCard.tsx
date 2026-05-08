"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import type { TreatmentProgramInstanceDetail } from "@/modules/treatment-program/types";
import { effectiveInstanceStageItemComment } from "@/modules/treatment-program/types";
import {
  isPersistentRecommendation,
  patientStageItemShowsNewBadge,
} from "@/modules/treatment-program/stage-semantics";
import { type PatientProgramChecklistRow } from "@/modules/treatment-program/patient-program-actions";
import { PatientTestSetProgressForm } from "@/app/app/patient/treatment/PatientTestSetProgressForm";
import {
  pickRecommendationRowPreviewMedia,
  parseRecommendationMediaFromSnapshot,
  recommendationBodyMdPreviewPlain,
} from "@/app/app/patient/treatment/stageItemSnapshot";
import { PatientCatalogMediaStaticThumb } from "@/shared/ui/patient/PatientCatalogMediaStaticThumb";
import { cn } from "@/lib/utils";
import { patientCompactActionClass, patientMutedTextClass, patientPillClass } from "@/shared/ui/patientVisual";
import { patientTreatmentProgramListItemClass } from "@/app/app/patient/treatment/program-detail/patientTreatmentProgramListItemClass";
import { snapshotTitle } from "@/app/app/patient/treatment/program-detail/patientPlanDetailFormatters";
import { usePostMarkItemViewedWhenVisible } from "@/app/app/patient/treatment/program-detail/usePostMarkItemViewedWhenVisible";
import { PatientLfkChecklistRow } from "@/app/app/patient/treatment/program-detail/PatientLfkChecklistRow";

export function PatientInstanceStageItemCard(props: {
  instanceId: string;
  stage: TreatmentProgramInstanceDetail["stages"][number];
  groupTitle: string | null;
  item: TreatmentProgramInstanceDetail["stages"][number]["items"][number];
  base: string;
  busy: string | null;
  setBusy: (v: string | null) => void;
  setError: (v: string | null) => void;
  refresh: () => Promise<void>;
  contentBlocked: boolean;
  /** Только просмотр: без отметок, чек-листов и полей ввода. */
  itemInteraction: "full" | "readOnly";
  doneItemIds: string[];
  onDoneItemIds: (ids: string[]) => void;
  /** Сколько строк `done` за сегодня по этому элементу (GET checklist-today). */
  todayChecklistDoneCount?: number;
  /** Нейтральный фон карточки (белый) на тонированной панели — блок рекомендаций на detail. */
  neutralItemChrome?: boolean;
  /** Ссылка на страницу детального просмотра пункта (вместо модалки). */
  itemDetailHref: string;
}) {
  const {
    instanceId,
    stage,
    groupTitle,
    item,
    base,
    busy,
    setBusy,
    setError,
    refresh,
    contentBlocked,
    itemInteraction,
    doneItemIds,
    onDoneItemIds,
    todayChecklistDoneCount,
    neutralItemChrome = false,
    itemDetailHref,
  } = props;
  const router = useRouter();
  const readOnly = itemInteraction === "readOnly";
  const [markingViewed, setMarkingViewed] = useState(false);
  const showsNew =
    !readOnly && patientStageItemShowsNewBadge(item, contentBlocked);
  const lfkRow = useMemo(
    (): PatientProgramChecklistRow => ({
      stageId: stage.id,
      stageTitle: stage.title,
      stageSortOrder: stage.sortOrder,
      groupId: item.groupId,
      groupTitle,
      item,
    }),
    [stage.id, stage.title, stage.sortOrder, item, groupTitle],
  );
  const recommendationPreviewMedia = useMemo(() => {
    if (item.itemType !== "recommendation") return null;
    return pickRecommendationRowPreviewMedia(parseRecommendationMediaFromSnapshot(item.snapshot));
  }, [item.itemType, item.snapshot]);
  const recommendationBodyPreview = useMemo(() => {
    if (item.itemType !== "recommendation") return "";
    return recommendationBodyMdPreviewPlain(item.snapshot.bodyMd);
  }, [item.itemType, item.snapshot]);
  const markRef = usePostMarkItemViewedWhenVisible({
    instanceId,
    itemId: item.id,
    enabled: showsNew,
    onDone: () => {
      void refresh();
    },
  });
  const openDetailLink = (
    <Link
      href={itemDetailHref}
      className={cn(
        buttonVariants({ variant: "outline", size: "sm" }),
        "inline-flex shrink-0 items-center justify-center",
        item.itemType === "recommendation" ? "h-8 px-2.5 text-xs" : "h-8",
      )}
    >
      Открыть
    </Link>
  );

  return (
    <li ref={markRef} className="list-none">
      <div
        className={cn(
          patientTreatmentProgramListItemClass,
          "cursor-pointer border-[var(--patient-border)]/80 transition-[filter] hover:brightness-[0.97] active:brightness-[0.95]",
          neutralItemChrome
            ? "bg-[var(--patient-card-bg)]"
            : "bg-[var(--patient-color-primary-soft)]/10",
          item.itemType === "recommendation" &&
            cn("flex h-14 items-center gap-2 overflow-hidden py-0 pl-0 pr-2 lg:gap-2.5 lg:pr-2.5"),
        )}
        onClick={(e) => {
          const el = e.target as HTMLElement;
          if (el.closest("button,a,[data-radix-collection-item]")) return;
          router.push(itemDetailHref);
        }}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            router.push(itemDetailHref);
          }
        }}
        role="button"
        tabIndex={0}
        aria-label={`Открыть: ${snapshotTitle(item.snapshot, item.itemType)}`}
      >
        {item.itemType === "recommendation" ? (
          <PatientCatalogMediaStaticThumb
            media={recommendationPreviewMedia}
            frameClassName="size-14 shrink-0 rounded-l-lg rounded-r-none border-y border-r border-[var(--patient-border)]/70"
            sizes="56px"
          />
        ) : null}
        <div
          className={cn(
            item.itemType === "recommendation" &&
              "flex min-h-0 min-w-0 flex-1 flex-col justify-center gap-0.5 overflow-hidden py-0 pr-0",
          )}
        >
          <p
            className={cn(
              "text-sm font-medium",
              item.itemType === "recommendation"
                ? "flex min-w-0 items-center gap-2 leading-tight"
                : "flex flex-wrap items-center gap-2",
            )}
          >
            <span className={cn(item.itemType === "recommendation" && "min-w-0 truncate")}>
              {snapshotTitle(item.snapshot, item.itemType)}
            </span>
            {showsNew ? (
              <span className="flex flex-wrap items-center gap-2">
                <span className={patientPillClass}>Новое</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-muted-foreground underline-offset-2 hover:underline"
                  disabled={markingViewed}
                  onClick={async (e) => {
                    e.stopPropagation();
                    setMarkingViewed(true);
                    setError(null);
                    try {
                      const res = await fetch(
                        `/api/patient/treatment-program-instances/${encodeURIComponent(instanceId)}/items/${encodeURIComponent(item.id)}/mark-viewed`,
                        { method: "POST" },
                      );
                      if (res.ok) void refresh();
                    } finally {
                      setMarkingViewed(false);
                    }
                  }}
                >
                  Снять «Новое»
                </Button>
              </span>
            ) : null}
            {item.itemType !== "recommendation" ? (
              <span className={cn(patientMutedTextClass, "font-normal")}>({item.itemType})</span>
            ) : null}
          </p>
          {item.itemType !== "recommendation" ? (
            <div className="mt-1 flex justify-end">{openDetailLink}</div>
          ) : null}
          {item.itemType === "recommendation" && recommendationBodyPreview ? (
            <p
              className={cn(
                patientMutedTextClass,
                "line-clamp-1 min-w-0 text-xs leading-tight",
              )}
            >
              {recommendationBodyPreview}
            </p>
          ) : null}
          {effectiveInstanceStageItemComment(item) && item.itemType !== "recommendation" ? (
            <p className={cn(patientMutedTextClass, "mt-1 text-xs")}>
              Комментарий:{" "}
              <span className="text-foreground">{effectiveInstanceStageItemComment(item)}</span>
            </p>
          ) : null}
          {item.itemType !== "recommendation" ? (
            <p className={cn(patientMutedTextClass, "mt-1 text-xs")}>
              Элемент:{" "}
              {item.completedAt ? (
                <span className="text-emerald-600 dark:text-emerald-400">выполнен</span>
              ) : (
                <span>не выполнен</span>
              )}
            </p>
          ) : null}
          {!readOnly &&
          todayChecklistDoneCount != null &&
          todayChecklistDoneCount > 0 &&
          item.itemType !== "recommendation" ? (
            <p className={cn(patientMutedTextClass, "mt-0.5 text-[11px] leading-snug")}>
              Отметок в журнале за сегодня:{" "}
              <span className="font-medium text-foreground">{todayChecklistDoneCount}</span>
            </p>
          ) : null}

          {!contentBlocked && !readOnly ? (
            item.itemType === "test_set" ? (
              <div className="mt-2" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                <PatientTestSetProgressForm
                  instanceId={instanceId}
                  itemId={item.id}
                  snapshot={item.snapshot as Record<string, unknown>}
                  completed={Boolean(item.completedAt)}
                  interactionDisabled={false}
                  baseUrl={base}
                  busy={busy}
                  setBusy={setBusy}
                  setError={setError}
                  onDone={refresh}
                />
              </div>
            ) : item.itemType === "lfk_complex" && !isPersistentRecommendation(item) ? (
              <div
                className="mt-2"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <PatientLfkChecklistRow
                  row={lfkRow}
                  itemBaseUrl={base}
                  done={doneItemIds.includes(item.id)}
                  onUpdated={onDoneItemIds}
                  onAfterSave={refresh}
                  setError={setError}
                />
              </div>
            ) : !isPersistentRecommendation(item) ? (
              <div className="mt-2">
                <button
                  type="button"
                  className={cn(patientCompactActionClass, "h-9 w-auto text-sm")}
                  disabled={busy !== null}
                  onClick={async (e) => {
                    e.stopPropagation();
                    setBusy(item.id);
                    setError(null);
                    try {
                      const res = await fetch(`${base}/${encodeURIComponent(item.id)}/progress/complete`, {
                        method: "POST",
                      });
                      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string };
                      if (!res.ok || !data.ok) {
                        setError(data.error ?? "Ошибка");
                        return;
                      }
                      await refresh();
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  {item.completedAt ? "Отметить ещё раз" : "Отметить выполненным"}
                </button>
              </div>
            ) : null
          ) : null}
          {!contentBlocked && readOnly && item.itemType === "test_set" ? (
            <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
              {item.completedAt ? "Набор тестов пройден." : "Набор тестов не выполнялся."}
            </p>
          ) : null}
        </div>
        {item.itemType === "recommendation" ? openDetailLink : null}
      </div>
    </li>
  );
}
