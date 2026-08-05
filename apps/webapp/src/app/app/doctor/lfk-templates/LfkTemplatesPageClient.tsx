'use client';

import { useRouter } from 'next/navigation';
import { Suspense, use, useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { Button } from '@/shared/ui/doctor/primitives/button';
import type { ExerciseLoadType, ExerciseMedia } from '@/modules/lfk-exercises/types';
import type { Template } from '@/modules/lfk-templates/types';
import { cn } from '@/lib/utils';
import { isDoctorCatalogMissingFilter } from '@/shared/lib/doctorCatalogEmptyFieldFilter';
import { useDoctorCatalogDisplayList } from '@/shared/hooks/useDoctorCatalogDisplayList';
import { useDoctorCatalogClientFilterMerge } from '@/shared/hooks/useDoctorCatalogClientFilterMerge';
import { doctorCatalogListEmptyClass } from '@/shared/ui/doctor/doctorVisual';
import { useDoctorCatalogMasterSelectionSync } from '@/shared/hooks/useDoctorCatalogMasterSelectionSync';
import {
  DoctorCatalogFiltersForm,
  type DoctorCatalogToolbarLayout,
} from '@/shared/ui/doctor/DoctorCatalogFiltersForm';
import { DoctorCatalogListSortHeader } from '@/shared/ui/doctor/DoctorCatalogListSortHeader';
import type { CatalogMasterTitleSort } from '@/shared/ui/doctor/DoctorCatalogMasterListHeader';
import { CatalogLeftPane } from '@/shared/ui/doctor/catalog/CatalogLeftPane';
import { CatalogRightPane } from '@/shared/ui/doctor/catalog/CatalogRightPane';
import { CatalogSplitLayout } from '@/shared/ui/doctor/catalog/CatalogSplitLayout';
import { DoctorCatalogPageLayout } from '@/shared/ui/doctor/catalog/DoctorCatalogPageLayout';
import { DoctorCatalogMasterListRow } from '@/shared/ui/doctor/DoctorCatalogMasterListRow';
import { VirtualizedItemGrid } from '@/shared/ui/doctor/catalog/VirtualizedItemGrid';
import {
  doctorCatalogToolbarPrimaryActionClassName,
  DoctorCatalogFiltersToolbar,
  DoctorCatalogToolbarFiltersSlot,
} from '@/shared/ui/doctor/DoctorCatalogFiltersToolbar';
import { MediaThumb } from '@/shared/ui/doctor/media/MediaThumb';
import { exerciseMediaToPreviewUi } from '@/shared/ui/doctor/media/mediaPreviewUiModel';
import { LfkTemplateStatusBadge } from './LfkTemplateStatusBadge';
import { LfkTemplatePreviewPanel } from './LfkTemplatePreviewPanel';
import { buildLfkTemplatesListPreserveQuery } from './lfkTemplatesListPreserveQuery';
import { TemplateEditor } from './TemplateEditor';
import type { DoctorCatalogPubArchQuery } from '@/shared/lib/doctorCatalogListStatus';
import { DoctorCatalogInvalidPubArchToast } from '@/shared/ui/doctor/DoctorCatalogInvalidPubArchToast';
import {
  DOCTOR_CATALOG_SPLIT_LAYOUT_MAX_H_EXPANDED,
  DOCTOR_CATALOG_SPLIT_LAYOUT_MAX_H_SINGLE,
} from '@/shared/ui/doctor/doctorWorkspaceLayout';

type ExerciseCatalogBundle = {
  exerciseCatalog: Array<{ id: string; title: string; firstMedia: ExerciseMedia | null }>;
  exerciseMetaById: Record<
    string,
    { regionRefIds: readonly string[]; loadType: ExerciseLoadType | null }
  >;
};

type Props = {
  templatesPromise: Promise<Template[]>;
  exerciseCatalogPromise: Promise<ExerciseCatalogBundle>;
  initialSelectedId?: string | null;
  bodyRegionIdToCode: Record<string, string>;
  filters: {
    q: string;
    regionCode?: string;
    loadType?: ExerciseLoadType;
    listPubArch: DoctorCatalogPubArchQuery;
  };
  initialTitleSort: 'asc' | 'desc' | null;
};

function CatalogSplitLayoutSkeleton() {
  return (
    <div className="hidden gap-3 lg:grid lg:grid-cols-2">
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="mb-3 h-8 animate-pulse rounded-md bg-muted/50" />
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div key={idx} className="h-12 animate-pulse rounded-md bg-muted/40" />
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="h-10 animate-pulse rounded-md bg-muted/50" />
          ))}
        </div>
      </div>
    </div>
  );
}

type ContentProps = Props & {
  titleSort: CatalogMasterTitleSort | null;
  setTitleSort: (next: CatalogMasterTitleSort | null) => void;
  isListPending: boolean;
  startListTransition: (fn: () => void) => void;
  filterToolbarLayout: DoctorCatalogToolbarLayout;
  onFilterToolbarLayoutChange: (layout: DoctorCatalogToolbarLayout) => void;
};

function LfkTemplatesContent({
  templatesPromise,
  exerciseCatalogPromise,
  initialSelectedId = null,
  bodyRegionIdToCode,
  filters,
  titleSort,
  setTitleSort,
  isListPending,
  startListTransition,
  filterToolbarLayout,
  onFilterToolbarLayoutChange,
}: ContentProps) {
  const router = useRouter();
  const templates = use(templatesPromise);
  const { exerciseCatalog, exerciseMetaById } = use(exerciseCatalogPromise);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [mobileSheet, setMobileSheet] = useState<Template | null>(null);

  const filterScope = useMemo(() => ({ ...filters, titleSort }), [filters, titleSort]);
  const mergedFilters = useDoctorCatalogClientFilterMerge(filterScope);

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
    mergedFilters.titleSort === null ? 'default' : mergedFilters.titleSort,
  );

  const displayList = useMemo(() => {
    let out = qSorted;
    const rc = mergedFilters.regionCode?.trim();
    const lt = mergedFilters.loadType;
    if (rc) {
      if (isDoctorCatalogMissingFilter(rc)) {
        out = out.filter((tpl) =>
          tpl.exercises.some((row) => !exerciseMetaById[row.exerciseId]?.regionRefIds?.length),
        );
      } else {
        out = out.filter((tpl) =>
          tpl.exercises.some((row) => {
            const m = exerciseMetaById[row.exerciseId];
            if (!m?.regionRefIds?.length) return false;
            return m.regionRefIds.some((rid) => (bodyRegionIdToCode[rid] ?? null) === rc);
          }),
        );
      }
    }
    if (lt) {
      if (isDoctorCatalogMissingFilter(lt)) {
        out = out.filter((tpl) =>
          tpl.exercises.some((row) => !exerciseMetaById[row.exerciseId]?.loadType),
        );
      } else {
        out = out.filter((tpl) =>
          tpl.exercises.some((row) => exerciseMetaById[row.exerciseId]?.loadType === lt),
        );
      }
    }
    return out;
  }, [
    qSorted,
    mergedFilters.regionCode,
    mergedFilters.loadType,
    exerciseMetaById,
    bodyRegionIdToCode,
  ]);

  useDoctorCatalogMasterSelectionSync({
    displayList,
    setSelectedId,
    setMobileItem: setMobileSheet,
    suspend: creating,
    fallbackToFirst: false,
  });

  const selected = creating ? null : (displayList.find((t) => t.id === selectedId) ?? null);

  const titleSortForHeader: CatalogMasterTitleSort | null =
    mergedFilters.titleSort === 'asc' || mergedFilters.titleSort === 'desc'
      ? mergedFilters.titleSort
      : null;

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
      <p className={doctorCatalogListEmptyClass}>Нет комплексов по заданным условиям.</p>
    ) : (
      <VirtualizedItemGrid
        items={displayList}
        columns={1}
        estimatedRowHeight={56}
        overscan={4}
        keyExtractor={(t) => t.id}
        containerClassName="h-full min-h-0"
        gridClassName="gap-1 pb-1"
        renderItem={(t) => {
          const active = activeId === t.id;
          const rowN = t.exerciseCount ?? t.exercises.length;
          const thumbs = (t.exerciseThumbnails ?? []).map(exerciseMediaToPreviewUi);
          const previewInner =
            thumbs.length === 0 ? (
              <span
                className={cn(
                  'self-center text-[11px] leading-none',
                  active ? 'text-primary/75' : 'text-muted-foreground',
                )}
              >
                Нет превью
              </span>
            ) : (
              <>
                {thumbs.map((m, idx) => (
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
                ))}
              </>
            );
          return (
            <DoctorCatalogMasterListRow
              active={active}
              onPick={() => onPick(t)}
              previewInner={previewInner}
              title={t.title}
              meta={<>Упражнений: {rowN}</>}
              badge={
                <LfkTemplateStatusBadge
                  status={t.status}
                  className="w-full justify-center text-[10px] leading-tight"
                />
              }
            />
          );
        }}
      />
    );

  const desktopRight = (
    <CatalogRightPane className="h-full">
      {/* Черновик «новый комплекс» держим смонтированным, чтобы не терять state при выборе строки в списке. */}
      <div
        className={cn('flex min-h-0 flex-1 flex-col', selected && 'hidden')}
        aria-hidden={Boolean(selected)}
      >
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
      </div>
      {selected ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {selected.ownerKind === 'platform' ? (
            <LfkTemplatePreviewPanel template={selected} />
          ) : (
            <TemplateEditor
              key={selected.id}
              template={selected}
              exerciseCatalog={exerciseCatalog}
              listPreserveQuery={listPreserveQuery}
            />
          )}
        </div>
      ) : null}
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
            onFilterToolbarLayoutChange={onFilterToolbarLayoutChange}
          />
        </DoctorCatalogToolbarFiltersSlot>
      }
      end={
        <Button
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
        </Button>
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
              <DoctorCatalogListSortHeader
                summaryLine={
                  displayList.length === 0
                    ? 'Нет комплексов'
                    : `Комплексов: ${displayList.length}`
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
                'min-h-0 flex-1 overflow-hidden transition-opacity',
                isListPending && 'opacity-80',
              )}
              aria-busy={isListPending}
            >
              {renderRows(
                (t) => pickRow(t.id),
                creating ? null : (selected?.id ?? mobileSheet?.id ?? null),
              )}
            </div>
          </CatalogLeftPane>
        }
        right={desktopRight}
        mobileView={mobileDetailOpen ? 'detail' : 'list'}
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

export function LfkTemplatesPageClient({
  templatesPromise,
  exerciseCatalogPromise,
  initialSelectedId = null,
  bodyRegionIdToCode,
  filters,
  initialTitleSort,
}: Props) {
  const [titleSort, setTitleSort] = useState<CatalogMasterTitleSort | null>(initialTitleSort);
  const [isListPending, startListTransition] = useTransition();
  const [filterToolbarLayout, setFilterToolbarLayout] =
    useState<DoctorCatalogToolbarLayout>('compact');
  const onFilterToolbarLayoutChange = useCallback((layout: DoctorCatalogToolbarLayout) => {
    setFilterToolbarLayout(layout);
  }, []);

  useEffect(() => {
    setTitleSort(initialTitleSort);
  }, [initialTitleSort]);

  return (
    <>
      <DoctorCatalogInvalidPubArchToast />
      <Suspense fallback={<CatalogSplitLayoutSkeleton />}>
        <LfkTemplatesContent
          templatesPromise={templatesPromise}
          exerciseCatalogPromise={exerciseCatalogPromise}
          initialSelectedId={initialSelectedId}
          bodyRegionIdToCode={bodyRegionIdToCode}
          filters={filters}
          initialTitleSort={initialTitleSort}
          titleSort={titleSort}
          setTitleSort={setTitleSort}
          isListPending={isListPending}
          startListTransition={startListTransition}
          filterToolbarLayout={filterToolbarLayout}
          onFilterToolbarLayoutChange={onFilterToolbarLayoutChange}
        />
      </Suspense>
    </>
  );
}
