"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { ExerciseLoadType, ExerciseMedia } from "@/modules/lfk-exercises/types";
import type { Template } from "@/modules/lfk-templates/types";
import { cn } from "@/lib/utils";
import { useDoctorCatalogDisplayList } from "@/shared/hooks/useDoctorCatalogDisplayList";
import { useDoctorCatalogClientFilterMerge } from "@/shared/hooks/useDoctorCatalogClientFilterMerge";
import { useDoctorCatalogMasterSelectionSync } from "@/shared/hooks/useDoctorCatalogMasterSelectionSync";
import { DoctorCatalogFiltersForm } from "@/shared/ui/doctor/DoctorCatalogFiltersForm";
import { DoctorCatalogListSortHeader } from "@/shared/ui/doctor/DoctorCatalogListSortHeader";
import type { CatalogMasterTitleSort } from "@/shared/ui/doctor/DoctorCatalogMasterListHeader";
import { CatalogLeftPane } from "@/shared/ui/CatalogLeftPane";
import { CatalogRightPane } from "@/shared/ui/CatalogRightPane";
import { CatalogSplitLayout } from "@/shared/ui/CatalogSplitLayout";
import { DoctorCatalogPageLayout } from "@/shared/ui/DoctorCatalogPageLayout";
import {
  doctorCatalogToolbarPrimaryActionClassName,
  DoctorCatalogFiltersToolbar,
  DoctorCatalogToolbarFiltersSlot,
} from "@/shared/ui/doctor/DoctorCatalogFiltersToolbar";
import { MediaThumb } from "@/shared/ui/media/MediaThumb";
import { exerciseMediaToPreviewUi } from "@/shared/ui/media/mediaPreviewUiModel";
import { LfkTemplateStatusBadge } from "./LfkTemplateStatusBadge";
import { buildLfkTemplatesListPreserveQuery } from "./lfkTemplatesListPreserveQuery";
import { TemplateEditor } from "./TemplateEditor";
import type { DoctorCatalogPubArchQuery } from "@/shared/lib/doctorCatalogListStatus";

type Props = {
  templates: Template[];
  initialSelectedId?: string | null;
  exerciseCatalog: Array<{ id: string; title: string; firstMedia: ExerciseMedia | null }>;
  exerciseMetaById: Record<string, { regionRefId: string | null; loadType: ExerciseLoadType | null }>;
  bodyRegionIdToCode: Record<string, string>;
  filters: {
    q: string;
    regionCode?: string;
    invalidRegionQuery?: boolean;
    loadType?: ExerciseLoadType;
    listPubArch: DoctorCatalogPubArchQuery;
  };
  initialTitleSort: "asc" | "desc" | null;
};

export function LfkTemplatesPageClient({
  templates,
  initialSelectedId = null,
  exerciseCatalog,
  exerciseMetaById,
  bodyRegionIdToCode,
  filters,
  initialTitleSort,
}: Props) {
  const router = useRouter();
  const [titleSort, setTitleSort] = useState<CatalogMasterTitleSort | null>(initialTitleSort);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [mobileSheet, setMobileSheet] = useState<Template | null>(null);
  const [isListPending, startListTransition] = useTransition();

  const filterScope = useMemo(() => ({ ...filters, titleSort }), [filters, titleSort]);
  const mergedFilters = useDoctorCatalogClientFilterMerge(filterScope);

  useEffect(() => {
    setTitleSort(initialTitleSort);
  }, [initialTitleSort]);

  useEffect(() => {
    if (!initialSelectedId) return;
    const found = templates.find((t) => t.id === initialSelectedId);
    if (!found) return;
    queueMicrotask(() => {
      setSelectedId(found.id);
      setCreating(false);
      setMobileSheet(found);
    });
  }, [initialSelectedId, templates]);

  const qSorted = useDoctorCatalogDisplayList(
    templates,
    mergedFilters.q,
    mergedFilters.titleSort === null ? "default" : mergedFilters.titleSort,
  );

  const displayList = useMemo(() => {
    let out = qSorted;
    const rc = mergedFilters.regionCode?.trim();
    const lt = mergedFilters.loadType;
    if (rc) {
      out = out.filter((tpl) =>
        tpl.exercises.some((row) => {
          const m = exerciseMetaById[row.exerciseId];
          if (!m?.regionRefId) return false;
          return (bodyRegionIdToCode[m.regionRefId] ?? null) === rc;
        }),
      );
    }
    if (lt) {
      out = out.filter((tpl) =>
        tpl.exercises.some((row) => exerciseMetaById[row.exerciseId]?.loadType === lt),
      );
    }
    return out;
  }, [qSorted, mergedFilters.regionCode, mergedFilters.loadType, exerciseMetaById, bodyRegionIdToCode]);

  useDoctorCatalogMasterSelectionSync({
    displayList,
    setSelectedId,
    setMobileItem: setMobileSheet,
    suspend: creating,
    fallbackToFirst: false,
  });

  const selected = creating ? null : (displayList.find((t) => t.id === selectedId) ?? null);

  const titleSortForHeader: CatalogMasterTitleSort | null =
    mergedFilters.titleSort === "asc" || mergedFilters.titleSort === "desc" ? mergedFilters.titleSort : null;

  const listPreserveQuery = useMemo(
    () =>
      buildLfkTemplatesListPreserveQuery({
        q: mergedFilters.q,
        regionCode: mergedFilters.regionCode,
        loadType: mergedFilters.loadType,
        listPubArch: mergedFilters.listPubArch,
        titleSort: mergedFilters.titleSort,
      }),
    [
      mergedFilters.q,
      mergedFilters.regionCode,
      mergedFilters.loadType,
      mergedFilters.listPubArch,
      mergedFilters.titleSort,
    ],
  );

  const changeTitleSort = (next: CatalogMasterTitleSort | null) => {
    startListTransition(() => {
      setTitleSort(next);
    });
  };

  const renderRows = (onPick: (t: Template) => void, activeId: string | null) =>
    displayList.length === 0 ? (
      <p className="text-sm text-muted-foreground">Нет комплексов по заданным условиям.</p>
    ) : (
      <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {displayList.map((t) => {
          const active = activeId === t.id;
          const rowN = t.exerciseCount ?? t.exercises.length;
          const thumbs = (t.exerciseThumbnails ?? []).map(exerciseMediaToPreviewUi);
          return (
            <li key={t.id} className="rounded-md border border-border/40 bg-card/30">
              <div className="flex w-full items-stretch gap-0">
                <button
                  type="button"
                  onClick={() => onPick(t)}
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-2 rounded-md border border-transparent px-2 py-2 text-left text-sm hover:bg-muted/80",
                    active &&
                      "border-primary/25 bg-primary/15 text-primary hover:bg-primary/20 dark:bg-primary/20 dark:hover:bg-primary/25",
                  )}
                >
                  <div className="flex min-h-[30px] flex-wrap content-end items-end gap-1">
                    {thumbs.length === 0 ? (
                      <span
                        className={cn(
                          "self-center text-[11px] leading-none",
                          active ? "text-primary/75" : "text-muted-foreground",
                        )}
                      >
                        Нет превью
                      </span>
                    ) : (
                      thumbs.map((m, idx) => (
                        <div
                          key={`${t.id}-${idx}-${m.id}`}
                          className="relative size-[30px] shrink-0 overflow-hidden rounded border border-border/50 bg-muted/30"
                        >
                          <MediaThumb
                            media={m}
                            className="size-full"
                            imgClassName="size-full object-cover"
                            sizes="30px"
                          />
                        </div>
                      ))
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 font-medium leading-tight">{t.title}</div>
                    <div
                      className={cn(
                        "text-xs tabular-nums",
                        active ? "text-primary/70" : "text-muted-foreground",
                      )}
                    >
                      Упражнений: {rowN}
                    </div>
                  </div>
                </button>
                <div
                  className="flex w-[6.75rem] shrink-0 flex-col items-stretch justify-center border-l border-border/40 bg-background/50 px-1 py-1"
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <LfkTemplateStatusBadge status={t.status} className="w-full justify-center text-[10px] leading-tight" />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    );

  const desktopRight = (
    <CatalogRightPane className="h-full">
      {selected ? (
        <TemplateEditor
          key={selected.id}
          template={selected}
          exerciseCatalog={exerciseCatalog}
          listPreserveQuery={listPreserveQuery}
        />
      ) : (
        <TemplateEditor
          key="new-lfk-template"
          template={null}
          exerciseCatalog={exerciseCatalog}
          listPreserveQuery={listPreserveQuery}
          onCreated={(id) => {
            setCreating(false);
            setSelectedId(id);
            router.refresh();
          }}
        />
      )}
    </CatalogRightPane>
  );

  const mobileDetailOpen = creating || mobileSheet != null;

  const toolbar = (
    <DoctorCatalogFiltersToolbar
      filters={
        <DoctorCatalogToolbarFiltersSlot>
          <DoctorCatalogFiltersForm
            idPrefix="lfk-tpl"
            q={mergedFilters.q}
            regionCode={mergedFilters.regionCode}
            loadType={mergedFilters.loadType}
            titleSort={mergedFilters.titleSort}
            catalogPubArch={mergedFilters.listPubArch}
          />
        </DoctorCatalogToolbarFiltersSlot>
      }
      end={
        <button
          type="button"
          className={doctorCatalogToolbarPrimaryActionClassName}
          id="doctor-lfk-templates-new-link"
          onClick={() => {
            setCreating(true);
            setSelectedId(null);
            setMobileSheet(null);
          }}
        >
          Создать
        </button>
      }
    />
  );

  const pickRow = (id: string) => {
    setCreating(false);
    const found = displayList.find((t) => t.id === id) ?? null;
    setSelectedId(id);
    setMobileSheet(found);
  };

  return (
    <DoctorCatalogPageLayout toolbar={toolbar}>
      {mergedFilters.invalidRegionQuery ? (
        <p
          role="status"
          className="border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-950 dark:text-amber-100"
        >
          Параметр «Регион» в адресе задан как UUID — ожидается код справочника (например spine). Фильтр по региону не
          применён.
        </p>
      ) : null}
      <CatalogSplitLayout
        className="lg:h-[calc(100dvh-3.5rem-env(safe-area-inset-top,0px)-3.25rem-1rem)] lg:overflow-hidden"
        left={
          <CatalogLeftPane
            stickySplit={false}
            stickyToolbarRows={1}
            className="h-full"
            headerSlot={
              <DoctorCatalogListSortHeader
                summaryLine={
                  displayList.length === 0 ? "Нет комплексов" : `Комплексов: ${displayList.length}`
                }
                titleSort={titleSortForHeader}
                onTitleSortChange={changeTitleSort}
                catalogPubArch={mergedFilters.listPubArch}
                archiveScopeExtraParams={{
                  titleSort: mergedFilters.titleSort,
                }}
              />
            }
          >
            <div
              className={cn(
                "min-h-0 flex-1 overflow-hidden transition-opacity",
                isListPending && "opacity-80",
              )}
              aria-busy={isListPending}
            >
              {renderRows((t) => pickRow(t.id), creating ? null : selected?.id ?? mobileSheet?.id ?? null)}
            </div>
          </CatalogLeftPane>
        }
        right={desktopRight}
        mobileView={mobileDetailOpen ? "detail" : "list"}
        mobileBackSlot={
          mobileDetailOpen ? (
            <Button
              variant="ghost"
              type="button"
              className="mb-2 h-9 px-2"
              onClick={() => {
                setMobileSheet(null);
                setCreating(false);
              }}
            >
              ← Назад
            </Button>
          ) : null
        }
      />
    </DoctorCatalogPageLayout>
  );
}
