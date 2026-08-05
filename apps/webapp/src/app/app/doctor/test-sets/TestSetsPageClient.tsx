'use client';

import { Suspense, use, useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { Button } from '@/shared/ui/doctor/primitives/button';
import type { TestSet, TestSetUsageSnapshot } from '@/modules/tests/types';
import { cn } from '@/lib/utils';
import { isDoctorCatalogMissingFilter } from '@/shared/lib/doctorCatalogEmptyFieldFilter';
import { useDoctorCatalogDisplayList } from '@/shared/hooks/useDoctorCatalogDisplayList';
import { useDoctorCatalogClientFilterMerge } from '@/shared/hooks/useDoctorCatalogClientFilterMerge';
import { doctorCatalogListEmptyClass } from '@/shared/ui/doctor/doctorVisual';
import { useDoctorCatalogMasterSelectionSync } from '@/shared/hooks/useDoctorCatalogMasterSelectionSync';
import type { CatalogMasterTitleSort } from '@/shared/ui/doctor/DoctorCatalogMasterListHeader';
import { DoctorCatalogListSortHeader } from '@/shared/ui/doctor/DoctorCatalogListSortHeader';
import { CatalogLeftPane } from '@/shared/ui/doctor/catalog/CatalogLeftPane';
import { CatalogRightPane } from '@/shared/ui/doctor/catalog/CatalogRightPane';
import { CatalogSplitLayout } from '@/shared/ui/doctor/catalog/CatalogSplitLayout';
import { DoctorCatalogPageLayout } from '@/shared/ui/doctor/catalog/DoctorCatalogPageLayout';
import { VirtualizedItemGrid } from '@/shared/ui/doctor/catalog/VirtualizedItemGrid';
import {
  doctorCatalogToolbarPrimaryActionClassName,
  DoctorCatalogFiltersToolbar,
  DoctorCatalogToolbarFiltersSlot,
} from '@/shared/ui/doctor/DoctorCatalogFiltersToolbar';
import {
  DoctorCatalogFiltersForm,
  type DoctorCatalogToolbarLayout,
} from '@/shared/ui/doctor/DoctorCatalogFiltersForm';
import {
  archiveDoctorTestSetInline,
  saveDoctorTestSetInline,
  unarchiveDoctorTestSetInline,
} from './actionsInline';
import type { DoctorCatalogPubArchQuery } from '@/shared/lib/doctorCatalogListStatus';
import { DoctorCatalogInvalidPubArchToast } from '@/shared/ui/doctor/DoctorCatalogInvalidPubArchToast';
import {
  DOCTOR_CATALOG_SPLIT_LAYOUT_MAX_H_EXPANDED,
  DOCTOR_CATALOG_SPLIT_LAYOUT_MAX_H_SINGLE,
} from '@/shared/ui/doctor/doctorWorkspaceLayout';
import { DoctorCatalogMasterListRow } from '@/shared/ui/doctor/DoctorCatalogMasterListRow';
import { MediaThumb } from '@/shared/ui/doctor/media/MediaThumb';
import { clinicalTestMediaItemToPreviewUi } from '@/shared/ui/doctor/media/mediaPreviewUiModel';
import type { ClinicalTestLibraryPickRow } from './clinicalTestLibraryRows';
import { TestSetForm } from './TestSetForm';
import { TestSetMasterListStatusBadge } from './TestSetMasterListStatusBadge';

type TestSetsBootstrap = {
  items: TestSet[];
  initialSelectedId: string | null;
  initialSelectedUsageSnapshot: TestSetUsageSnapshot | null;
  clinicalTestsLibrary: ClinicalTestLibraryPickRow[];
};

type Props = {
  listPromise: Promise<TestSetsBootstrap>;
  bodyRegionIdToCode: Record<string, string>;
  filters: {
    q: string;
    regionCode?: string;
    listPubArch: DoctorCatalogPubArchQuery;
  };
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

function TestSetsContent({
  listPromise,
  bodyRegionIdToCode,
  filters,
  titleSort,
  setTitleSort,
  isListPending,
  startListTransition,
  filterToolbarLayout,
  onFilterToolbarLayoutChange,
}: Props & {
  titleSort: CatalogMasterTitleSort | null;
  setTitleSort: (next: CatalogMasterTitleSort | null) => void;
  isListPending: boolean;
  startListTransition: (fn: () => void) => void;
  filterToolbarLayout: DoctorCatalogToolbarLayout;
  onFilterToolbarLayoutChange: (layout: DoctorCatalogToolbarLayout) => void;
}) {
  const bootstrap = use(listPromise);
  const initialSets = bootstrap.items;
  const initialSelectedId = bootstrap.initialSelectedId;
  const initialSelectedUsageSnapshot = bootstrap.initialSelectedUsageSnapshot;
  const clinicalTestsLibrary = bootstrap.clinicalTestsLibrary;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [mobileSheet, setMobileSheet] = useState<TestSet | null>(null);

  const filterScope = useMemo(() => ({ ...filters, titleSort }), [filters, titleSort]);
  const mergedFilters = useDoctorCatalogClientFilterMerge(filterScope);

  useEffect(() => {
    if (!initialSelectedId) return;
    const found = initialSets.find((s) => s.id === initialSelectedId);
    if (!found) return;
    queueMicrotask(() => {
      setSelectedId(found.id);
      setCreating(false);
      setMobileSheet(found);
    });
  }, [initialSelectedId, initialSets]);

  const qSorted = useDoctorCatalogDisplayList(
    initialSets,
    mergedFilters.q,
    mergedFilters.titleSort === null ? 'default' : mergedFilters.titleSort,
  );

  const displayList = useMemo(() => {
    const rc = mergedFilters.regionCode?.trim();
    if (!rc) return qSorted;
    if (isDoctorCatalogMissingFilter(rc)) {
      return qSorted.filter((s) => s.items.some((it) => !it.test.bodyRegionIds.length));
    }
    return qSorted.filter((s) =>
      s.items.some((it) => it.test.bodyRegionIds.some((bid) => bodyRegionIdToCode[bid] === rc)),
    );
  }, [qSorted, mergedFilters.regionCode, bodyRegionIdToCode]);

  const titleSortForHeader: CatalogMasterTitleSort | null =
    mergedFilters.titleSort === 'asc' || mergedFilters.titleSort === 'desc'
      ? mergedFilters.titleSort
      : null;

  const changeTitleSort = (next: CatalogMasterTitleSort | null) => {
    startListTransition(() => {
      setTitleSort(next);
    });
  };

  useDoctorCatalogMasterSelectionSync({
    displayList,
    setSelectedId,
    setMobileItem: setMobileSheet,
    suspend: creating,
    fallbackToFirst: false,
  });

  const selected = creating ? null : (displayList.find((s) => s.id === selectedId) ?? null);

  const usageForSelection = (() => {
    const current = mobileSheet ?? selected;
    if (!current || initialSelectedUsageSnapshot == null) return undefined;
    if (initialSelectedId === current.id) return initialSelectedUsageSnapshot;
    return undefined;
  })();

  const renderRows = (onPick: (s: TestSet) => void, activeId: string | null) =>
    displayList.length === 0 ? (
      <p className={doctorCatalogListEmptyClass}>Нет наборов по заданным условиям.</p>
    ) : (
      <VirtualizedItemGrid
        items={displayList}
        columns={1}
        estimatedRowHeight={56}
        overscan={4}
        keyExtractor={(s) => s.id}
        containerClassName="h-full min-h-0"
        gridClassName="gap-1 pb-1"
        renderItem={(s) => {
          const active = activeId === s.id;
          const sortedItems = [...s.items].sort((a, b) => a.sortOrder - b.sortOrder);
          const previewItems = sortedItems.filter((it) => Boolean(it.test.previewMedia?.mediaUrl));
          const previewInner =
            previewItems.length === 0 ? (
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
                {previewItems.slice(0, 12).map((it) => {
                  const m = it.test.previewMedia!;
                  return (
                    <div
                      key={it.id}
                      className="relative size-[30px] shrink-0 overflow-hidden rounded border border-border/50 bg-muted/30"
                    >
                      <MediaThumb
                        media={clinicalTestMediaItemToPreviewUi(m)}
                        className="size-full"
                        imgClassName="size-full object-cover"
                        sizes="30px"
                      />
                    </div>
                  );
                })}
              </>
            );
          return (
            <DoctorCatalogMasterListRow
              active={active}
              onPick={() => {
                setCreating(false);
                onPick(s);
              }}
              previewInner={previewInner}
              title={s.title}
              meta={<>Тестов в наборе: {s.items.length}</>}
              badge={
                <TestSetMasterListStatusBadge
                  publicationStatus={s.publicationStatus}
                  isArchived={s.isArchived}
                  className="w-full justify-center text-[10px] leading-tight"
                />
              }
            />
          );
        }}
      />
    );

  const rightInner = (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
      {/* Черновик набора держим смонтированным, чтобы не терять state при выборе строки в списке. */}
      <div
        className={cn('flex min-h-0 max-w-2xl flex-1 flex-col', selected && 'hidden')}
        aria-hidden={Boolean(selected)}
      >
        <TestSetForm
          key="test-set-inline-draft"
          testSet={null}
          saveAction={saveDoctorTestSetInline}
          archiveAction={archiveDoctorTestSetInline}
          clinicalTestsLibrary={clinicalTestsLibrary}
        />
      </div>
      {selected ? (
        <div key={selected.id} className="flex min-h-0 max-w-2xl flex-1 flex-col gap-4">
          <TestSetForm
            testSet={selected}
            saveAction={saveDoctorTestSetInline}
            archiveAction={archiveDoctorTestSetInline}
            unarchiveAction={unarchiveDoctorTestSetInline}
            workspaceListPreserve={{
              q: mergedFilters.q,
              titleSort: mergedFilters.titleSort,
              regionCode: mergedFilters.regionCode,
              listPubArch: mergedFilters.listPubArch,
            }}
            externalUsageSnapshot={usageForSelection}
            clinicalTestsLibrary={clinicalTestsLibrary}
          />
        </div>
      ) : null}
    </div>
  );

  const desktopRight = <CatalogRightPane className="h-full">{rightInner}</CatalogRightPane>;

  const mobileDetailOpen = creating || mobileSheet != null;

  const toolbar = (
    <DoctorCatalogFiltersToolbar
      filters={
        <DoctorCatalogToolbarFiltersSlot>
          <DoctorCatalogFiltersForm
            idPrefix="ts"
            q={mergedFilters.q}
            regionCode={mergedFilters.regionCode}
            showLoadFilter={false}
            titleSort={mergedFilters.titleSort}
            selectedId={creating ? null : (selected?.id ?? mobileSheet?.id ?? null)}
            catalogPubArch={mergedFilters.listPubArch}
            onFilterToolbarLayoutChange={onFilterToolbarLayoutChange}
          />
        </DoctorCatalogToolbarFiltersSlot>
      }
      end={
        <Button
          type="button"
          size="sm"
          className={doctorCatalogToolbarPrimaryActionClassName}
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
                  displayList.length === 0 ? 'Нет наборов' : `Наборов: ${displayList.length}`
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
                (s) => {
                  setCreating(false);
                  setSelectedId(s.id);
                  setMobileSheet(s);
                },
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

export function TestSetsPageClient({ listPromise, bodyRegionIdToCode, filters }: Props) {
  const [titleSort, setTitleSort] = useState<CatalogMasterTitleSort | null>(null);
  const [isListPending, startListTransition] = useTransition();
  const [filterToolbarLayout, setFilterToolbarLayout] =
    useState<DoctorCatalogToolbarLayout>('compact');
  const onFilterToolbarLayoutChange = useCallback((layout: DoctorCatalogToolbarLayout) => {
    setFilterToolbarLayout(layout);
  }, []);

  return (
    <>
      <DoctorCatalogInvalidPubArchToast />
      <Suspense fallback={<CatalogSplitLayoutSkeleton />}>
        <TestSetsContent
          listPromise={listPromise}
          bodyRegionIdToCode={bodyRegionIdToCode}
          filters={filters}
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
