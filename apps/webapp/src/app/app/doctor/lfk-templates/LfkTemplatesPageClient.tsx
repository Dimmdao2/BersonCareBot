"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ExerciseLoadType, ExerciseMedia } from "@/modules/lfk-exercises/types";
import type { Template, TemplateStatus } from "@/modules/lfk-templates/types";
import { cn } from "@/lib/utils";
import { useDoctorCatalogDisplayList } from "@/shared/hooks/useDoctorCatalogDisplayList";
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
import { createLfkTemplateDraft } from "./actions";
import { buildLfkTemplatesListPreserveQuery } from "./lfkTemplatesListPreserveQuery";
import { TemplateEditor } from "./TemplateEditor";
import type { DoctorCatalogPubArchQuery } from "@/shared/lib/doctorCatalogListStatus";

type Props = {
  templates: Template[];
  exerciseCatalog: Array<{ id: string; title: string; firstMedia: ExerciseMedia | null }>;
  filters: {
    q: string;
    regionRefId?: string;
    loadType?: ExerciseLoadType;
    listPubArch: DoctorCatalogPubArchQuery;
  };
  initialTitleSort: "asc" | "desc" | null;
};

function statusEyeMeta(status: TemplateStatus) {
  const published = status === "published";
  const archived = status === "archived";
  const label = archived ? "В архиве" : published ? "Опубликован" : "Черновик";
  return { published, label };
}

export function LfkTemplatesPageClient({
  templates,
  exerciseCatalog,
  filters,
  initialTitleSort,
}: Props) {
  const [titleSort, setTitleSort] = useState<CatalogMasterTitleSort | null>(initialTitleSort);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileSheet, setMobileSheet] = useState<Template | null>(null);
  const [isListPending, startListTransition] = useTransition();

  useEffect(() => {
    setTitleSort(initialTitleSort);
  }, [initialTitleSort]);

  const displayList = useDoctorCatalogDisplayList(
    templates,
    filters.q,
    titleSort === null ? "default" : titleSort,
  );

  useDoctorCatalogMasterSelectionSync({
    displayList,
    setSelectedId,
    setMobileItem: setMobileSheet,
    fallbackToFirst: false,
  });

  const selected = displayList.find((t) => t.id === selectedId) ?? null;

  const titleSortForHeader: CatalogMasterTitleSort | null =
    titleSort === "asc" || titleSort === "desc" ? titleSort : null;

  const listPreserveQuery = useMemo(
    () =>
      buildLfkTemplatesListPreserveQuery({
        q: filters.q,
        regionRefId: filters.regionRefId,
        loadType: filters.loadType,
        listPubArch: filters.listPubArch,
        titleSort,
      }),
    [filters.q, filters.regionRefId, filters.loadType, filters.listPubArch, titleSort],
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
          const { published, label } = statusEyeMeta(t.status);
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
                <span
                  className="inline-flex w-10 shrink-0 cursor-default items-center justify-center border-l border-border/40 bg-background/50"
                  role="img"
                  aria-label={label}
                  title={label}
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  {published ? (
                    <Eye className="size-4 text-green-600 dark:text-green-500" aria-hidden />
                  ) : (
                    <EyeOff className="size-4 text-muted-foreground" aria-hidden />
                  )}
                </span>
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
        <section className="flex max-w-md flex-col gap-4 rounded-lg border border-border bg-card p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">
            Задайте название черновика. После создания вы попадёте в конструктор, где можно добавить упражнения и
            опубликовать комплекс.
          </p>
          <form action={createLfkTemplateDraft} className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <label htmlFor="lfk-tpl-new-title-inline" className="text-sm font-medium">
                Название
              </label>
              <Input id="lfk-tpl-new-title-inline" name="title" placeholder="Новый комплекс" />
            </div>
            <Button type="submit">Создать и открыть</Button>
          </form>
        </section>
      )}
    </CatalogRightPane>
  );

  const mobileDetailOpen = mobileSheet != null;

  const toolbar = (
    <DoctorCatalogFiltersToolbar
      filters={
        <DoctorCatalogToolbarFiltersSlot>
          <DoctorCatalogFiltersForm
            key={`lfk-filters-${filters.listPubArch.arch}-${filters.listPubArch.pub}-${filters.q}-${filters.regionRefId ?? ""}-${filters.loadType ?? ""}`}
            idPrefix="lfk-tpl"
            q={filters.q}
            regionRefId={filters.regionRefId}
            loadType={filters.loadType}
            titleSort={titleSort}
            catalogPubArch={filters.listPubArch}
          />
        </DoctorCatalogToolbarFiltersSlot>
      }
      end={
        <Link
          href="/app/doctor/lfk-templates/new"
          className={doctorCatalogToolbarPrimaryActionClassName}
          id="doctor-lfk-templates-new-link"
        >
          Создать
        </Link>
      }
    />
  );

  const pickRow = (id: string) => {
    const found = displayList.find((t) => t.id === id) ?? null;
    setSelectedId(id);
    setMobileSheet(found);
  };

  return (
    <DoctorCatalogPageLayout toolbar={toolbar}>
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
                catalogPubArch={filters.listPubArch}
                archiveScopeExtraParams={{
                  titleSort,
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
              {renderRows((t) => pickRow(t.id), selected?.id ?? mobileSheet?.id ?? null)}
            </div>
          </CatalogLeftPane>
        }
        right={desktopRight}
        mobileView={mobileDetailOpen ? "detail" : "list"}
        mobileBackSlot={
          mobileDetailOpen ? (
            <Button variant="ghost" type="button" className="mb-2 h-9 px-2" onClick={() => setMobileSheet(null)}>
              ← Назад
            </Button>
          ) : null
        }
      />
    </DoctorCatalogPageLayout>
  );
}
