'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { Suspense, use, useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button, buttonVariants } from '@/shared/ui/doctor/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/doctor/primitives/dropdown-menu';
import { DoctorCatalogMasterListHeader } from '@/shared/ui/doctor/DoctorCatalogMasterListHeader';
import { DoctorPanelLoading } from '@/shared/ui/doctor/DoctorPanelLoading';
import type {
  Exercise,
  ExerciseLoadType,
  ExerciseUsageSnapshot,
} from '@/modules/lfk-exercises/types';
import type { RecommendationListFilterScope } from '@/shared/lib/doctorCatalogListStatus';
import { cn } from '@/lib/utils';
import { useViewportMinWidth } from '@/shared/hooks/useViewportMinWidth';
import {
  doctorCatalogViewStorageKey,
  readDoctorCatalogViewPreference,
  writeDoctorCatalogViewPreference,
} from '@/shared/lib/doctorCatalogViewPreference';
import {
  doctorCatalogToolbarPrimaryActionClassName,
  DoctorCatalogFiltersToolbar,
  DoctorCatalogToolbarFiltersSlot,
} from '@/shared/ui/doctor/DoctorCatalogFiltersToolbar';
import {
  doctorCatalogListEmptyClass,
  doctorCatalogListEmptyTilesClass,
  doctorCatalogRowActiveClass,
  doctorCatalogRowClass,
} from '@/shared/ui/doctor/doctorVisual';
import type { DoctorCatalogToolbarLayout } from '@/shared/ui/doctor/DoctorCatalogFiltersForm';
import {
  DOCTOR_CATALOG_SPLIT_LAYOUT_MAX_H_EXPANDED,
  DOCTOR_CATALOG_SPLIT_LAYOUT_MAX_H_SINGLE,
} from '@/shared/ui/doctor/doctorWorkspaceLayout';
import { CatalogLeftPane } from '@/shared/ui/doctor/catalog/CatalogLeftPane';
import { CatalogRightPane } from '@/shared/ui/doctor/catalog/CatalogRightPane';
import { CatalogSplitLayout } from '@/shared/ui/doctor/catalog/CatalogSplitLayout';
import { DoctorCatalogPageLayout } from '@/shared/ui/doctor/catalog/DoctorCatalogPageLayout';
import { ExerciseListCatalogThumb } from '@/shared/ui/doctor/media/ExerciseListCatalogThumb';
import { VirtualizedItemGrid } from '@/shared/ui/doctor/catalog/VirtualizedItemGrid';
import { ExercisesFiltersForm } from './ExercisesFiltersForm';
import {
  archiveExerciseInline,
  saveExerciseInline,
  unarchiveExerciseInline,
} from './actionsInline';
import { ExerciseTileCard } from './ExerciseTileCard';
import { useDoctorCatalogDisplayList } from '@/shared/hooks/useDoctorCatalogDisplayList';
import { useDoctorCatalogClientFilterMerge } from '@/shared/hooks/useDoctorCatalogClientFilterMerge';
import type { ReferenceItemDto } from '@/modules/references/referenceCache';

export type ExercisesViewMode = 'tiles' | 'list';

export type ExerciseTitleSort = 'asc' | 'desc';

const ExerciseForm = dynamic(() => import('./ExerciseForm').then((mod) => mod.ExerciseForm), {
  loading: () => <DoctorPanelLoading className="min-h-48" />,
});

const LIST_ROW_VISIBILITY_STYLE = {
  contentVisibility: 'auto',
  containIntrinsicSize: '52px',
} as const;

type DoctorExerciseSelection = {
  exercise: Exercise | null;
  usage: ExerciseUsageSnapshot | null;
};

type Props = {
  listPromise: Promise<Exercise[]>;
  doctorExerciseSelectionPromise: Promise<DoctorExerciseSelection>;
  initialViewMode: ExercisesViewMode;
  /** Если false — режим подставляется из localStorage (последний выбор на этой странице). */
  viewLockedByUrl: boolean;
  initialTitleSort: ExerciseTitleSort | null;
  bodyRegionIdToCode: Record<string, string>;
  bodyRegionItems: ReferenceItemDto[];
  loadTypeItems: ReferenceItemDto[];
  filters: {
    q: string;
    regionCode?: string;
    loadType?: ExerciseLoadType;
    listStatus: RecommendationListFilterScope;
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
          doctorCatalogToolbarPrimaryActionClassName,
          'data-popup-open:bg-primary/90 dark:data-popup-open:bg-primary/85',
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
        <DropdownMenuItem onClick={() => router.push('/app/doctor/exercises/auto-create')}>
          Автосоздание
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type ExerciseCatalogFiltersMerged = Props['filters'] & { titleSort: ExerciseTitleSort | null };

type ExercisesContentProps = {
  listPromise: Promise<Exercise[]>;
  doctorExerciseSelectionPromise: Promise<DoctorExerciseSelection>;
  viewMode: ExercisesViewMode;
  toolbarViewMode: ExercisesViewMode;
  desktopSelectedId: string | null;
  mobileSheet: { exercise: Exercise | null } | null;
  isListPending: boolean;
  setDesktopSelectedId: (id: string | null) => void;
  setMobileSheet: (sheet: { exercise: Exercise | null } | null) => void;
  toggleViewMode: () => void;
  changeTitleSort: (next: ExerciseTitleSort | null) => void;
  filters: ExerciseCatalogFiltersMerged;
  bodyRegionIdToCode: Record<string, string>;
  bodyRegionItems: ReferenceItemDto[];
  loadTypeItems: ReferenceItemDto[];
  filterToolbarLayout: DoctorCatalogToolbarLayout;
  onFilterToolbarLayoutChange: (layout: DoctorCatalogToolbarLayout) => void;
};

function ExercisesContent({
  listPromise,
  doctorExerciseSelectionPromise,
  viewMode,
  toolbarViewMode,
  desktopSelectedId,
  mobileSheet,
  isListPending,
  setDesktopSelectedId,
  setMobileSheet,
  toggleViewMode,
  changeTitleSort,
  filters,
  bodyRegionIdToCode,
  bodyRegionItems,
  loadTypeItems,
  filterToolbarLayout,
  onFilterToolbarLayoutChange,
}: ExercisesContentProps) {
  const exercises = use(listPromise);
  const selection = use(doctorExerciseSelectionPromise);

  const getItemRegionCodes = useCallback(
    (ex: Exercise) =>
      ex.regionRefIds.map((rid) => bodyRegionIdToCode[rid]).filter((c): c is string => Boolean(c)),
    [bodyRegionIdToCode],
  );
  const getItemLoadType = useCallback((ex: Exercise) => ex.loadType, []);

  useEffect(() => {
    if (selection.exercise?.id) setDesktopSelectedId(selection.exercise.id);
  }, [selection.exercise?.id, setDesktopSelectedId]);

  useEffect(() => {
    if (!desktopSelectedId) return;
    const inList = exercises.some((e) => e.id === desktopSelectedId);
    const fromServer = selection.exercise?.id === desktopSelectedId;
    if (!inList && !fromServer) setDesktopSelectedId(null);
  }, [desktopSelectedId, exercises, selection.exercise?.id, setDesktopSelectedId]);

  const exerciseForDesktop = useMemo(() => {
    if (!desktopSelectedId) return null;
    const fromList = exercises.find((e) => e.id === desktopSelectedId);
    if (fromList) return fromList;
    if (selection.exercise?.id === desktopSelectedId) return selection.exercise;
    return null;
  }, [desktopSelectedId, exercises, selection.exercise]);

  const usageForSelection = useMemo(() => {
    const current = mobileSheet?.exercise ?? exerciseForDesktop;
    if (!current) return undefined;
    if (selection.exercise?.id === current.id && selection.usage != null) {
      return selection.usage;
    }
    return undefined;
  }, [exerciseForDesktop, mobileSheet?.exercise, selection.exercise?.id, selection.usage]);

  const displayExercises = useDoctorCatalogDisplayList(
    exercises,
    filters.q,
    filters.titleSort === null ? 'default' : filters.titleSort,
    {
      regionCode: filters.regionCode,
      loadType: filters.loadType ?? null,
      getItemRegionCodes,
      getItemLoadType,
    },
  );

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
      <p className={doctorCatalogListEmptyClass}>Нет упражнений по заданным фильтрам.</p>
    ) : (
      <ul className="flex h-full min-h-0 flex-col gap-1 overflow-y-auto">
        {list.map((ex) => {
          const active = opts.activeId === ex.id;
          return (
            <li key={ex.id}>
              <div style={LIST_ROW_VISIBILITY_STYLE}>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => opts.onRowSelect(ex.id)}
                  className={cn(doctorCatalogRowClass, active && doctorCatalogRowActiveClass)}
                >
                  {mediaNode(ex)}
                  <span className="min-w-0 text-left">
                    <span className="line-clamp-2">{ex.title}</span>
                    {ex.ownerKind === 'platform' ? (
                      <span className="block text-[11px] text-muted-foreground">
                        Базовая библиотека
                      </span>
                    ) : null}
                  </span>
                </Button>
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
      <p className={doctorCatalogListEmptyTilesClass}>Нет упражнений по заданным фильтрам.</p>
    ) : (
      <VirtualizedItemGrid
        items={list}
        columns={opts.columns}
        estimatedRowHeight={220}
        overscan={2}
        keyExtractor={(ex) => ex.id}
        containerClassName="h-full max-h-[70vh] lg:max-h-none"
        gridClassName="pb-2"
        renderItem={(ex) => (
          <div className="w-full min-w-0">
            <ExerciseTileCard
              exercise={ex}
              onSelect={(id) => opts.onTileSelect(id)}
              isActive={opts.activeId === ex.id}
              squarePreview={opts.columns === 4}
            />
          </div>
        )}
      />
    );

  const rightPanel = (
    <CatalogRightPane className="h-full">
      <ExerciseForm
        exercise={mobileSheet?.exercise ?? exerciseForDesktop}
        bodyRegionItems={bodyRegionItems}
        loadTypeItems={loadTypeItems}
        saveAction={saveExerciseInline}
        archiveAction={archiveExerciseInline}
        unarchiveAction={unarchiveExerciseInline}
        listArchiveScope={filters.listStatus}
        viewHint={viewMode}
        externalUsageSnapshot={usageForSelection}
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
                bodyRegionItems={bodyRegionItems}
                loadTypeItems={loadTypeItems}
                regionCode={filters.regionCode}
                loadType={filters.loadType}
                view={viewMode}
                titleSort={filters.titleSort}
                selectedId={desktopSelectedId}
                onFilterToolbarLayoutChange={onFilterToolbarLayoutChange}
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
        className={cn(
          filterToolbarLayout === 'expanded'
            ? DOCTOR_CATALOG_SPLIT_LAYOUT_MAX_H_EXPANDED
            : DOCTOR_CATALOG_SPLIT_LAYOUT_MAX_H_SINGLE,
        )}
        left={
          <CatalogLeftPane
            stickySplit={false}
            stickyToolbarRows={1}
            className="h-full"
            headerSlot={
              <DoctorCatalogMasterListHeader
                summaryLine={
                  displayExercises.length === 0
                    ? 'Нет упражнений'
                    : `Упражнений: ${displayExercises.length}`
                }
                viewMode={toolbarViewMode}
                onToggleView={toggleViewMode}
                titleSort={filters.titleSort}
                onTitleSortChange={changeTitleSort}
                listBusy={isListPending}
                archiveScope={filters.listStatus}
                archiveScopeExtraParams={{
                  view: viewMode,
                  titleSort: filters.titleSort,
                }}
              />
            }
          >
            <div
              className={cn(
                'min-h-0 flex-1 overflow-hidden transition-opacity',
                isListPending && 'opacity-80',
              )}
              aria-busy={isListPending}
            >
              {viewMode === 'list'
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
        mobileView={mobileSheet != null ? 'detail' : 'list'}
        mobileBackSlot={
          mobileSheet != null ? (
            <Button
              variant="ghost"
              type="button"
              className="mb-2 h-9 px-2"
              onClick={() => setMobileSheet(null)}
            >
              ← Назад
            </Button>
          ) : null
        }
      />
    </DoctorCatalogPageLayout>
  );
}

function CatalogSplitLayoutSkeleton() {
  return <DoctorPanelLoading className="min-h-48" />;
}

export function ExercisesPageClient({
  listPromise,
  doctorExerciseSelectionPromise,
  initialViewMode,
  viewLockedByUrl,
  initialTitleSort,
  bodyRegionIdToCode,
  bodyRegionItems,
  loadTypeItems,
  filters,
}: Props) {
  const [viewMode, setViewMode] = useState<ExercisesViewMode>(initialViewMode);
  const [toolbarViewMode, setToolbarViewMode] = useState<ExercisesViewMode>(initialViewMode);
  const [titleSort, setTitleSort] = useState<ExerciseTitleSort | null>(initialTitleSort);
  const [desktopSelectedId, setDesktopSelectedId] = useState<string | null>(null);
  const [mobileSheet, setMobileSheet] = useState<{ exercise: Exercise | null } | null>(null);
  const [isListPending, startListTransition] = useTransition();
  const [filterToolbarLayout, setFilterToolbarLayout] =
    useState<DoctorCatalogToolbarLayout>('compact');
  const onFilterToolbarLayoutChange = useCallback((layout: DoctorCatalogToolbarLayout) => {
    setFilterToolbarLayout(layout);
  }, []);

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
    const next = toolbarViewMode === 'tiles' ? 'list' : 'tiles';
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

  const filterScope = useMemo(() => ({ ...filters, titleSort }), [filters, titleSort]);
  const mergedFilters = useDoctorCatalogClientFilterMerge(filterScope);

  return (
    <Suspense fallback={<CatalogSplitLayoutSkeleton />}>
      <ExercisesContent
        listPromise={listPromise}
        doctorExerciseSelectionPromise={doctorExerciseSelectionPromise}
        viewMode={viewMode}
        toolbarViewMode={toolbarViewMode}
        desktopSelectedId={desktopSelectedId}
        mobileSheet={mobileSheet}
        isListPending={isListPending}
        setDesktopSelectedId={setDesktopSelectedId}
        setMobileSheet={setMobileSheet}
        toggleViewMode={toggleViewMode}
        changeTitleSort={changeTitleSort}
        filters={mergedFilters}
        bodyRegionIdToCode={bodyRegionIdToCode}
        bodyRegionItems={bodyRegionItems}
        loadTypeItems={loadTypeItems}
        filterToolbarLayout={filterToolbarLayout}
        onFilterToolbarLayoutChange={onFilterToolbarLayoutChange}
      />
    </Suspense>
  );
}
