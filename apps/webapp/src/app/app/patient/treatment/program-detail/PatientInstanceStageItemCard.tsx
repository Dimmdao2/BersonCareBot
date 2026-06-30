"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, buttonVariants } from "@/shared/ui/patient/primitives/button";
import type { TreatmentProgramInstanceDetail } from "@/modules/treatment-program/types";
import { effectiveInstanceStageItemComment } from "@/modules/treatment-program/types";
import { patientStageItemShowsNewBadge } from "@/modules/treatment-program/stage-semantics";
import { PatientTestSetProgressForm } from "@/app/app/patient/treatment/PatientTestSetProgressForm";
import type { PatientTestSetPageServerSnapshot } from "@/modules/treatment-program/progress-service";
import {
  pickRecommendationRowPreviewMedia,
  parseRecommendationMediaFromSnapshot,
  recommendationBodyMdPreviewPlain,
} from "@/app/app/patient/treatment/stageItemSnapshot";
import { PatientCatalogMediaStaticThumb } from "@/shared/ui/patient/PatientCatalogMediaStaticThumb";
import { AlertTriangle, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  patientMutedTextClass,
  patientPillClass,
} from "@/shared/ui/patient/patientVisual";
import { patientTreatmentProgramListItemClass } from "@/app/app/patient/treatment/program-detail/patientTreatmentProgramListItemClass";
import { snapshotTitle } from "@/app/app/patient/treatment/program-detail/patientPlanDetailFormatters";
import { usePostMarkItemViewedWhenVisible } from "@/app/app/patient/treatment/program-detail/usePostMarkItemViewedWhenVisible";
import { treatmentProgramItemToRatingTarget } from "@/modules/material-rating/mapProgramItemToTarget";
import { MaterialRatingBlock } from "@/shared/ui/patient/material-rating/MaterialRatingBlock";
import { PatientProgramItemExecutionRow } from "@/app/app/patient/treatment/PatientProgramItemExecutionRow";
import type { ProgramItemLastDoneSummary } from "@/app/app/patient/treatment/programItemExecutionDisplay";

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
  /** Время последней отметки из checklist-today (для cooldown повтора «Выполнено»). */
  lastDoneAtIsoByItemId?: Readonly<Record<string, string>>;
  /** Ссылка на страницу детального просмотра пункта (вместо модалки). */
  itemDetailHref: string;
  /** @deprecated Unused after button removal; kept for backward-compat with callers. */
  planItemDoneRepeatCooldownMinutes?: number;
  /** QW-A3: summary of discussion comments for this item (count badge + unread dot). */
  discussionSummary?: { totalCount: number; unreadCount: number };
  /** QW-A3: IANA timezone for PatientProgramItemExecutionRow execution dots. */
  appDisplayTimeZone?: string;
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
    lastDoneAtIsoByItemId,
    itemDetailHref,
    discussionSummary,
    appDisplayTimeZone,
  } = props;
  const router = useRouter();
  const readOnly = itemInteraction === "readOnly";
  const [markingViewed, setMarkingViewed] = useState(false);
  const [lastDoneSummary, setLastDoneSummary] = useState<ProgramItemLastDoneSummary | null>(null);
  const showsNew =
    !readOnly && patientStageItemShowsNewBadge(item, contentBlocked);
  const recommendationPreviewMedia = useMemo(() => {
    if (item.itemType !== "recommendation") return null;
    return pickRecommendationRowPreviewMedia(parseRecommendationMediaFromSnapshot(item.snapshot));
  }, [item.itemType, item.snapshot]);
  const recommendationBodyPreview = useMemo(() => {
    if (item.itemType !== "recommendation") return "";
    return recommendationBodyMdPreviewPlain(item.snapshot.bodyMd);
  }, [item.itemType, item.snapshot]);
  const [clinicalTestSnap, setClinicalTestSnap] = useState<PatientTestSetPageServerSnapshot | null>(null);
  const [clinicalTestSnapLoaded, setClinicalTestSnapLoaded] = useState(false);

  const reloadClinicalTestSnap = useCallback(
    async (signal?: AbortSignal) => {
      if (item.itemType !== "clinical_test" || readOnly || contentBlocked) {
        setClinicalTestSnap(null);
        setClinicalTestSnapLoaded(true);
        return;
      }
      setClinicalTestSnapLoaded(false);
      try {
        const res = await fetch(
          `/api/patient/treatment-program-instances/${encodeURIComponent(instanceId)}/items/${encodeURIComponent(item.id)}/progress/test-set-snapshot`,
          { signal },
        );
        const data = (await res.json().catch(() => null)) as {
          ok?: boolean;
          snapshot?: PatientTestSetPageServerSnapshot;
        };
        if (res.ok && data.ok && data.snapshot) {
          setClinicalTestSnap(data.snapshot);
        } else {
          setClinicalTestSnap(null);
        }
      } catch (e) {
        if (signal?.aborted) return;
        throw e;
      } finally {
        if (!signal?.aborted) {
          setClinicalTestSnapLoaded(true);
        }
      }
    },
    [instanceId, item.id, item.itemType, readOnly, contentBlocked],
  );

  useEffect(() => {
    const ac = new AbortController();
    void reloadClinicalTestSnap(ac.signal);
    return () => ac.abort();
  }, [reloadClinicalTestSnap]);

  useEffect(() => {
    if (item.itemType !== "exercise" || !lastDoneAtIsoByItemId?.[item.id]) {
      setLastDoneSummary(null);
      return;
    }
    const ac = new AbortController();
    void (async () => {
      try {
        const res = await fetch(`${base}/${encodeURIComponent(item.id)}/progress/complete/metrics`, {
          signal: ac.signal,
        });
        const data = (await res.json().catch(() => null)) as {
          ok?: boolean;
          metrics?: {
            reps?: number | null;
            sets?: number | null;
            weightKg?: number | null;
          } | null;
        } | null;
        if (!res.ok || !data?.ok || !data.metrics) {
          setLastDoneSummary(null);
          return;
        }
        const { reps = null, sets = null, weightKg = null } = data.metrics;
        setLastDoneSummary({ reps, sets, weightKg });
      } catch (e) {
        if (!ac.signal.aborted) setLastDoneSummary(null);
      }
    })();
    return () => ac.abort();
  }, [base, item.id, item.itemType, lastDoneAtIsoByItemId]);

  const markRef = usePostMarkItemViewedWhenVisible({
    instanceId,
    itemId: item.id,
    enabled: showsNew,
    onDone: () => {
      void (async () => {
        await refresh();
        await reloadClinicalTestSnap();
      })();
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
                      if (res.ok) {
                        await refresh();
                        await reloadClinicalTestSnap();
                      }
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
          {item.itemType !== "recommendation" && appDisplayTimeZone ? (
            <PatientProgramItemExecutionRow
              lastIso={lastDoneAtIsoByItemId?.[item.id] ?? null}
              todayCount={todayChecklistDoneCount ?? 0}
              appDisplayTimeZone={appDisplayTimeZone}
              lastDoneSummary={lastDoneSummary}
              variant="tile"
              className="mt-1"
            />
          ) : null}
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
          {/* QW-A3: icon row — comments · contraindications · execution dots */}
          {item.itemType !== "recommendation" ? (
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
              {(discussionSummary?.totalCount ?? 0) > 0 ? (
                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  <MessageCircle className="size-3.5 shrink-0" aria-hidden />
                  <span className="tabular-nums">{discussionSummary!.totalCount}</span>
                  {(discussionSummary?.unreadCount ?? 0) > 0 ? (
                    <span className="size-1.5 shrink-0 rounded-full bg-destructive" aria-label="непрочитанные" />
                  ) : null}
                </span>
              ) : null}
              {Boolean((item.snapshot as Record<string, unknown>)?.contraindications) ? (
                <AlertTriangle className="size-3.5 shrink-0 text-amber-500" aria-label="Противопоказания" />
              ) : null}
            </div>
          ) : null}

          {(() => {
            const t = treatmentProgramItemToRatingTarget(item.itemType, item.itemRefId);
            if (!t.kind) return null;
            return (
              <div
                className="mt-2"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <MaterialRatingBlock
                  targetKind={t.kind}
                  targetId={t.targetId}
                  programInstanceId={instanceId}
                  programStageItemId={item.id}
                  readOnly={readOnly || contentBlocked}
                />
              </div>
            );
          })()}

          {!contentBlocked && !readOnly && itemInteraction === "full" ? (
            item.itemType === "clinical_test" ? (
              <div className="mt-2" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                {!clinicalTestSnapLoaded ? (
                  <p className={cn(patientMutedTextClass, "text-xs")}>Загрузка…</p>
                ) : (
                  <PatientTestSetProgressForm
                    instanceId={instanceId}
                    itemId={item.id}
                    snapshot={item.snapshot as Record<string, unknown>}
                    readOnlySummary={clinicalTestSnap?.variant === "readonly_submitted"}
                    interactionDisabled={false}
                    baseUrl={base}
                    busy={busy}
                    setBusy={setBusy}
                    setError={setError}
                    onDone={async () => {
                      await refresh();
                      await reloadClinicalTestSnap();
                    }}
                    serverSnapshot={clinicalTestSnap}
                  />
                )}
              </div>
            ) : null
          ) : null}
          {!contentBlocked && readOnly && item.itemType === "clinical_test" ? (
            <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
              {item.completedAt ? "Тест пройден." : "Тест не выполнялся."}
            </p>
          ) : null}
        </div>
        {item.itemType === "recommendation" ? openDetailLink : null}
      </div>
    </li>
  );
}
