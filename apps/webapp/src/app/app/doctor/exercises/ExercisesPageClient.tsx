"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Suspense, use, useEffect, useMemo, useState, useTransition } from "react";
import { ChevronDown } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DoctorCatalogMasterListHeader } from "@/shared/ui/doctor/DoctorCatalogMasterListHeader";
import type { Exercise, ExerciseLoadType } from "@/modules/lfk-exercises/types";
import { cn } from "@/lib/utils";
import { useViewportMinWidth } from "@/shared/hooks/useViewportMinWidth";
import {
  doctorCatalogViewStorageKey,
  readDoctorCatalogViewPreference,
  writeDoctorCatalogViewPreference,
} from "@/shared/lib/doctorCatalogViewPreference";
import {
  DoctorCatalogFiltersToolbar,
  DoctorCatalogToolbarFiltersSlot,
} from "@/shared/ui/doctor/DoctorCatalogFiltersToolbar";
import { CatalogLeftPane } from "@/shared/ui/CatalogLeftPane";
import { CatalogRightPane } from "@/shared/ui/CatalogRightPane";
import { CatalogSplitLayout } from "@/shared/ui/CatalogSplitLayout";
import { DoctorCatalogPageLayout } from "@/shared/ui/DoctorCatalogPageLayout";
import { ExerciseListCatalogThumb } from "@/shared/ui/media/ExerciseListCatalogThumb";
import { VirtualizedItemGrid } from "@/shared/ui/VirtualizedItemGrid";
import { ExercisesFiltersForm } from "./ExercisesFiltersForm";
import { archiveExerciseInline, saveExerciseInline } from "./actionsInline";
import { ExerciseTileCard } from "./ExerciseTileCard";

export type ExercisesViewMode = "tiles" | "list";

export type ExerciseTitleSort = "asc" | "desc";

const ExerciseForm = dynamic(
  () => import("./ExerciseForm").then((mod) => mod.ExerciseForm),
  {
    loading: () => (
      <div className="rounded-xl border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
        Загрузка формы…
      </div>
    ),
  },
);

const LIST_ROW_VISIBILITY_STYLE = {
  contentVisibility: "auto",
  containIntrinsicSize: "52px",
} as const;

type Props = {
  listPromise: Promise<Exercise[]>;
  selectedExercisePromise: Promise<Exercise | null>;
  initialViewMode: ExercisesViewMode;
  /** Если false — режим подставляется из localStorage (последний выбор на этой странице). */
  viewLockedByUrl: boolean;
  initialTitleSort: ExerciseTitleSort | null;
  filters: {
    q: string;
    regionRefId?: string;
    loadType?: ExerciseLoadType;
  };
};

/** Desktop tiles: всегда не меньше 3 колонок; при 4 — ряд из 4; при 8+ — до 4 колонок. */
function desktopExerciseTileColumns(count: number): number {
  if (count <= 3) return 3;
  if (count === 4) return 4;
  if (count <= 7) return 3;
  return 4;
}

/** Mobile tiles: не меньше 3 колонок (узкая ширина — одна сетка на 3 колонки). */
function mobileExerciseTileColumns(): number {
  return 3;
}

function mediaNode(exercise: Exercise) {
  return <ExerciseListCatalogThumb media={exercise.media[0]} />;
}

type CreateExerciseMenuProps = {
  triggerId?: string;
  onNewExercise: () => void;
};

function CreateExerciseMenu({ triggerId, onNewExercise }: CreateExerciseMenuProps) {
  const router = useRouter();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        id={triggerId}
        className={cn(
          buttonVariants({ variant: "default", size: "sm" }),
          "box-border h-[32px] min-h-[32px] inline-flex shrink-0 gap-1 px-3 py-1 text-sm leading-5 data-popup-open:bg-primary/90 dark:data-popup-open:bg-primary/85",
        )}
        type="button"
      >
        Создать
        <ChevronDown className="size-4 shrink-0 opacity-95" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuItem
          onClick={() => {
            onNewExercise();
          }}
        >
          Новое упражнение
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push("/app/doctor/exercises/auto-create")}>Автосоздание</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type ExercisesContentProps = {
  listPromise: Promise<Exercise[]>;
  selectedExercisePromise: Promise<Exercise | null>;
  viewMode: ExercisesViewMode;
  toolbarViewMode: ExercisesViewMode;
  titleSort: ExerciseTitleSort | null;
  desktopSelectedId: string | null;
  mobileSheet: { exercise: Exercise | null } | null;
  isListPending: boolean;
  setDesktopSelectedId: (id: string | null) => void;
  setMobileSheet: (sheet: { exercise: Exercise | null } | null) => void;
  toggleViewMode: () => void;
  changeTitleSort: (next: ExerciseTitleSort | null) => void;
  filters: Props["filters"];
};

function ExercisesContent({
  listPromise,
  selectedExercisePromise,
  viewMode,
  toolbarViewMode,
  titleSort,
  desktopSelectedId,
  mobileSheet,
  isListPending,
  setDesktopSelectedId,
  setMobileSheet,
  toggleViewMode,
  changeTitleSort,
  filters,
}: ExercisesContentProps) {
  const exercises = use(listPromise);
  const selectedExercise = use(selectedExercisePromise);

  useEffect(() => {
    if (selectedExercise?.id) setDesktopSelectedId(selectedExercise.id);
  }, [selectedExercise?.id, setDesktopSelectedId]);

  useEffect(() => {
    if (!desktopSelectedId) return;
    const inList = exercises.some((e) => e.id === desktopSelectedId);
    const fromServer = selectedExercise?.id === desktopSelectedId;
    if (!inList && !fromServer) setDesktopSelectedId(null);
  }, [desktopSelectedId, exercises, selectedExercise?.id, setDesktopSelectedId]);

  const exerciseForDesktop = useMemo(() => {
    if (!desktopSelectedId) return null;
    const fromList = exercises.find((e) => e.id === desktopSelectedId);
    if (fromList) return fromList;
    if (selectedExercise?.id === desktopSelectedId) return selectedExercise;
    return null;
  }, [desktopSelectedId, exercises, selectedExercise]);

  const displayExercises = useMemo(() => {
    if (!titleSort) return exercises;
    return [...exercises].sort((a, b) => {
      const cmp = a.title.localeCompare(b.title, "ru", { sensitivity: "base" });
      return titleSort === "asc" ? cmp : -cmp;
    });
  }, [exercises, titleSort]);

  const isDesktopViewport = useViewportMinWidth(1024);
  const n = displayExercises.length;
  const tileColsDesktop = desktopExerciseTileColumns(n);
  const tileColsMobile = mobileExerciseTileColumns();
  const activeTileColumns = isDesktopViewport ? tileColsDesktop : tileColsMobile;
  const renderExerciseList = (
    list: Exercise[],
    opts: { activeId: string | null; onRowSelect: (id: string) => void },
  ) =>
    list.length === 0 ? (
      <p className="px-2 pb-2 text-sm text-muted-foreground">Нет упражнений по заданным фильтрам.</p>
    ) : (
      <ul className="flex h-full min-h-0 flex-col gap-1 overflow-y-auto">
        {list.map((ex) => {
          const active = opts.activeId === ex.id;
          return (
            <li key={ex.id}>
              <div style={LIST_ROW_VISIBILITY_STYLE}>
                <button
                  type="button"
                  onClick={() => opts.onRowSelect(ex.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-2 text-left text-sm hover:bg-muted",
                    active &&
                      "border-primary/25 bg-primary/15 text-primary hover:bg-primary/20 dark:bg-primary/20 dark:hover:bg-primary/25",
                  )}
                >
                  {mediaNode(ex)}
                  <span className="line-clamp-2">{ex.title}</span>
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    );

  const renderExerciseTiles = (
    list: Exercise[],
    opts: { activeId: string | null; onTileSelect: (id: string) => void; columns: number },
  ) =>
    list.length === 0 ? (
      <p className="px-2 text-sm text-muted-foreground">Нет упражнений по заданным фильтрам.</p>
    ) : (
      <VirtualizedItemGrid
        items={list}
        columns={opts.columns}
        estimatedRowHeight={220}
        overscan={2}
        keyExtractor={(ex) => ex.id}
        containerClassName="h-full max-h-[70vh] lg:max-h-none"
        renderItem={(ex) => (
          <div className="w-full min-w-0">
            <ExerciseTileCard
              exercise={ex}
              onSelect={(id) => opts.onTileSelect(id)}
              isActive={opts.activeId === ex.id}
            />
          </div>
        )}
      />
    );

  const rightPanel = (
    <CatalogRightPane className="h-full">
      <ExerciseForm
        exercise={mobileSheet?.exercise ?? exerciseForDesktop}
        saveAction={saveExerciseInline}
        archiveAction={archiveExerciseInline}
        viewHint={viewMode}
      />
    </CatalogRightPane>
  );

  return (
    <DoctorCatalogPageLayout
      toolbar={
        <DoctorCatalogFiltersToolbar
          filters={
            <DoctorCatalogToolbarFiltersSlot>
              <ExercisesFiltersForm
                idPrefix="ex"
                q={filters.q}
                regionRefId={filters.regionRefId}
                loadType={filters.loadType}
                view={viewMode}
                titleSort={titleSort}
                selectedId={desktopSelectedId}
              />
            </DoctorCatalogToolbarFiltersSlot>
          }
          end={
            <CreateExerciseMenu
              triggerId="doctor-exercises-create-link-desktop"
              onNewExercise={() => {
                setDesktopSelectedId(null);
                setMobileSheet({ exercise: null });
              }}
            />
          }
        />
      }
    >
      <CatalogSplitLayout
        className="lg:h-[calc(100dvh-3.5rem-env(safe-area-inset-top,0px)-3.25rem-1rem)] lg:overflow-hidden"
        left={
          <CatalogLeftPane
            stickySplit={false}
            stickyToolbarRows={1}
            className="h-full"
            headerSlot={
              <DoctorCatalogMasterListHeader
                summaryLine={
                  displayExercises.length === 0 ? "Нет упражнений" : `Упражнений: ${displayExercises.length}`
                }
                viewMode={toolbarViewMode}
                onToggleView={toggleViewMode}
                titleSort={titleSort}
                onTitleSortChange={changeTitleSort}
                listBusy={isListPending}
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
              {viewMode === "list"
                ? renderExerciseList(displayExercises, {
                    activeId: desktopSelectedId,
                    onRowSelect: (id) => {
                      const found = displayExercises.find((e) => e.id === id) ?? null;
                      setDesktopSelectedId(id);
                      setMobileSheet(found ? { exercise: found } : null);
                    },
                  })
                : renderExerciseTiles(displayExercises, {
                    activeId: desktopSelectedId,
                    onTileSelect: (id) => {
                      const found = displayExercises.find((e) => e.id === id) ?? null;
                      setDesktopSelectedId(id);
                      setMobileSheet(found ? { exercise: found } : null);
                    },
                    columns: activeTileColumns,
                  })}
            </div>
          </CatalogLeftPane>
        }
        right={rightPanel}
        mobileView={mobileSheet != null ? "detail" : "list"}
        mobileBackSlot={
          mobileSheet != null ? (
            <Button variant="ghost" type="button" className="mb-2 h-9 px-2" onClick={() => setMobileSheet(null)}>
              ← Назад
            </Button>
          ) : null
        }
      />
    </DoctorCatalogPageLayout>
  );
}

function CatalogSplitLayoutSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="hidden gap-3 lg:grid lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="mb-3 flex items-center justify-between gap-2 border-b border-border/60 pb-3">
            <div className="h-4 w-32 animate-pulse rounded bg-muted/50" />
            <div className="flex gap-2">
              <div className="h-8 w-36 animate-pulse rounded-md bg-muted/50" />
              <div className="h-8 w-8 animate-pulse rounded-md bg-muted/50" />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 9 }).map((_, idx) => (
              <div key={idx} className="rounded-xl border border-border/60 p-2">
                <div className="h-32 animate-pulse rounded-md bg-muted/50" />
                <div className="mx-auto mt-3 h-4 w-4/5 animate-pulse rounded bg-muted/50" />
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl bg-card px-6 py-4">
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="space-y-2">
                <div className="h-4 w-28 animate-pulse rounded bg-muted/50" />
                <div className="h-10 animate-pulse rounded-md bg-muted/50" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-3 lg:hidden">
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div key={idx} className="rounded-xl border border-border/60 p-2">
              <div className="h-24 animate-pulse rounded-md bg-muted/50" />
              <div className="mx-auto mt-2 h-4 w-4/5 animate-pulse rounded bg-muted/50" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ExercisesPageClient({
  listPromise,
  selectedExercisePromise,
  initialViewMode,
  viewLockedByUrl,
  initialTitleSort,
  filters,
}: Props) {
  const [viewMode, setViewMode] = useState<ExercisesViewMode>(initialViewMode);
  const [toolbarViewMode, setToolbarViewMode] = useState<ExercisesViewMode>(initialViewMode);
  const [titleSort, setTitleSort] = useState<ExerciseTitleSort | null>(initialTitleSort);
  const [desktopSelectedId, setDesktopSelectedId] = useState<string | null>(null);
  const [mobileSheet, setMobileSheet] = useState<{ exercise: Exercise | null } | null>(null);
  const [isListPending, startListTransition] = useTransition();

  useEffect(() => {
    if (viewLockedByUrl) {
      setViewMode(initialViewMode);
      setToolbarViewMode(initialViewMode);
      return;
    }
    const saved = readDoctorCatalogViewPreference(doctorCatalogViewStorageKey.exercises);
    if (saved) {
      setViewMode(saved);
      setToolbarViewMode(saved);
    }
  }, [viewLockedByUrl, initialViewMode]);

  useEffect(() => {
    setTitleSort(initialTitleSort);
  }, [initialTitleSort]);

  const toggleViewMode = () => {
    const next = toolbarViewMode === "tiles" ? "list" : "tiles";
    setToolbarViewMode(next);
    writeDoctorCatalogViewPreference(doctorCatalogViewStorageKey.exercises, next);
    startListTransition(() => {
      setViewMode(next);
    });
  };

  const changeTitleSort = (next: ExerciseTitleSort | null) => {
    startListTransition(() => {
      setTitleSort(next);
    });
  };

  return (
    <Suspense fallback={<CatalogSplitLayoutSkeleton />}>
      <ExercisesContent
        listPromise={listPromise}
        selectedExercisePromise={selectedExercisePromise}
        viewMode={viewMode}
        toolbarViewMode={toolbarViewMode}
        titleSort={titleSort}
        desktopSelectedId={desktopSelectedId}
        mobileSheet={mobileSheet}
        isListPending={isListPending}
        setDesktopSelectedId={setDesktopSelectedId}
        setMobileSheet={setMobileSheet}
        toggleViewMode={toggleViewMode}
        changeTitleSort={changeTitleSort}
        filters={filters}
      />
    </Suspense>
  );
}
