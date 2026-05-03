"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { ClinicalTest, ClinicalTestUsageSnapshot } from "@/modules/tests/types";
import type { ReferenceItemDto } from "@/modules/references/referenceCache";
import type { ReferenceItem } from "@/modules/references/types";
import { buildClinicalAssessmentKindSelectOptions } from "@/modules/tests/clinicalTestAssessmentKind";
import { cn } from "@/lib/utils";
import { useViewportMinWidth } from "@/shared/hooks/useViewportMinWidth";
import {
  doctorCatalogViewStorageKey,
  readDoctorCatalogViewPreference,
  writeDoctorCatalogViewPreference,
} from "@/shared/lib/doctorCatalogViewPreference";
import { MediaThumb } from "@/shared/ui/media/MediaThumb";
import { clinicalTestMediaItemToPreviewUi } from "@/shared/ui/media/mediaPreviewUiModel";
import { VirtualizedItemGrid } from "@/shared/ui/VirtualizedItemGrid";
import { DoctorCatalogMasterListHeader } from "@/shared/ui/doctor/DoctorCatalogMasterListHeader";
import {
  doctorCatalogToolbarPrimaryActionClassName,
  DoctorCatalogFiltersToolbar,
  DoctorCatalogToolbarFiltersSlot,
} from "@/shared/ui/doctor/DoctorCatalogFiltersToolbar";
import { CatalogLeftPane } from "@/shared/ui/CatalogLeftPane";
import { CatalogRightPane } from "@/shared/ui/CatalogRightPane";
import { CatalogSplitLayout } from "@/shared/ui/CatalogSplitLayout";
import { DoctorCatalogPageLayout } from "@/shared/ui/DoctorCatalogPageLayout";
import type { RecommendationListFilterScope } from "@/shared/lib/doctorCatalogListStatus";
import { archiveClinicalTestInline, saveClinicalTestInline, unarchiveClinicalTestInline } from "./actionsInline";
import { DoctorCatalogFiltersForm } from "@/shared/ui/doctor/DoctorCatalogFiltersForm";
import { Card, CardContent } from "@/components/ui/card";
import { ClinicalTestForm } from "./ClinicalTestForm";
import { useDoctorCatalogDisplayList } from "@/shared/hooks/useDoctorCatalogDisplayList";
import { useDoctorCatalogClientFilterMerge } from "@/shared/hooks/useDoctorCatalogClientFilterMerge";

export type ClinicalTestsViewMode = "tiles" | "list";
export type ClinicalTestTitleSort = "asc" | "desc";

const LIST_ROW_VISIBILITY_STYLE = {
  contentVisibility: "auto",
  containIntrinsicSize: "52px",
} as const;

type Props = {
  initialItems: ClinicalTest[];
  initialSelectedId: string | null;
  /** Usage для `?selected=`, чтобы не дёргать клиентский fetch при первом рендере. */
  initialSelectedUsageSnapshot: ClinicalTestUsageSnapshot | null;
  initialViewMode: ClinicalTestsViewMode;
  viewLockedByUrl: boolean;
  initialTitleSort: ClinicalTestTitleSort | null;
  assessmentKindFilterItems: ReferenceItemDto[];
  assessmentKindCatalogItems: ReferenceItem[];
  bodyRegionIdToCode: Record<string, string>;
  filters: {
    q: string;
    regionCode?: string;
    invalidRegionQuery?: boolean;
    assessmentKind?: string;
    /** Ненулевой `?assessment=` в URL не совпал со справочником — фильтр не применён. */
    invalidAssessmentQuery?: boolean;
    listStatus: RecommendationListFilterScope;
  };
};

/** Как у упражнений: минимум 3 колонки на desktop. */
function desktopClinicalTestsTileColumns(count: number): number {
  if (count <= 3) return 3;
  if (count === 4) return 4;
  if (count <= 7) return 3;
  return 4;
}

function mobileClinicalTestsTileColumns(): number {
  return 3;
}

function ClinicalTestTileCard({
  test,
  onSelect,
  isActive,
}: {
  test: ClinicalTest;
  onSelect: (id: string) => void;
  isActive: boolean;
}) {
  const firstMedia = test.media[0];
  return (
    <button
      type="button"
      className="flex w-full cursor-pointer justify-center rounded-xl border-0 bg-transparent p-0 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      onClick={() => onSelect(test.id)}
    >
      <Card
        size="sm"
        className={cn(
          "h-full w-full min-w-0 transition-shadow",
          isActive && "ring-1 ring-primary/50 ring-offset-1 ring-offset-background",
        )}
      >
        <CardContent className="flex h-full flex-col gap-1 p-0.5">
          {firstMedia ? (
            <div className="h-[135px] w-full overflow-hidden rounded-md border border-border/60 bg-muted/30">
              <MediaThumb
                media={clinicalTestMediaItemToPreviewUi(firstMedia)}
                className="h-full w-full"
                imgClassName="h-full w-full object-cover"
                sizes="160px"
              />
            </div>
          ) : null}
          <p className="line-clamp-2 px-0.5 text-center text-xs leading-snug text-foreground">{test.title}</p>
          {test.testType ? (
            <p className="line-clamp-1 px-0.5 text-center text-[10px] text-muted-foreground">{test.testType}</p>
          ) : null}
        </CardContent>
      </Card>
    </button>
  );
}

function mediaThumbRow(test: ClinicalTest) {
  const m = test.media[0];
  if (!m) {
    return <div className="h-9 w-9 shrink-0 rounded bg-muted" aria-hidden />;
  }
  return (
    <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded border border-border/40 bg-muted/30">
      <MediaThumb
        media={clinicalTestMediaItemToPreviewUi(m)}
        className="size-full"
        imgClassName="size-full object-cover"
        sizes="36px"
      />
    </div>
  );
}

type ClinicalCatalogFiltersMerged = Props["filters"] & { titleSort: ClinicalTestTitleSort | null };

function ClinicalTestsContent({
  initialItems,
  initialSelectedId,
  initialSelectedUsageSnapshot,
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
  assessmentKindFilterItems,
  assessmentKindCatalogItems,
  bodyRegionIdToCode,
}: {
  initialItems: ClinicalTest[];
  initialSelectedId: string | null;
  initialSelectedUsageSnapshot: ClinicalTestUsageSnapshot | null;
  viewMode: ClinicalTestsViewMode;
  toolbarViewMode: ClinicalTestsViewMode;
  desktopSelectedId: string | null;
  mobileSheet: { test: ClinicalTest | null } | null;
  isListPending: boolean;
  setDesktopSelectedId: (id: string | null) => void;
  setMobileSheet: (sheet: { test: ClinicalTest | null } | null) => void;
  toggleViewMode: () => void;
  changeTitleSort: (next: ClinicalTestTitleSort | null) => void;
  filters: ClinicalCatalogFiltersMerged;
  assessmentKindFilterItems: ReferenceItemDto[];
  assessmentKindCatalogItems: ReferenceItem[];
  bodyRegionIdToCode: Record<string, string>;
}) {
  useEffect(() => {
    if (!initialSelectedId) return;
    const found = initialItems.find((t) => t.id === initialSelectedId);
    if (!found) return;
    queueMicrotask(() => {
      setDesktopSelectedId(found.id);
      setMobileSheet({ test: found });
    });
  }, [initialSelectedId, initialItems, setDesktopSelectedId, setMobileSheet]);

  const getItemRegionCode = useCallback(
    (t: ClinicalTest) =>
      t.bodyRegionId ? (bodyRegionIdToCode[t.bodyRegionId] ?? null) : null,
    [bodyRegionIdToCode],
  );

  const displayTests = useDoctorCatalogDisplayList(
    initialItems,
    filters.q,
    filters.titleSort === null ? "default" : filters.titleSort,
    {
      regionCode: filters.regionCode,
      getItemRegionCode,
      tertiaryCode: filters.invalidAssessmentQuery ? null : (filters.assessmentKind ?? null),
      getItemTertiaryCode: (t) => t.assessmentKind,
    },
  );

  useEffect(() => {
    if (!desktopSelectedId) return;
    const inList = displayTests.some((t) => t.id === desktopSelectedId);
    const fromInitial = initialItems.some((t) => t.id === desktopSelectedId);
    if (!inList && !fromInitial) setDesktopSelectedId(null);
  }, [desktopSelectedId, displayTests, initialItems, setDesktopSelectedId]);

  const testForDesktop = useMemo(() => {
    if (!desktopSelectedId) return null;
    return displayTests.find((t) => t.id === desktopSelectedId) ?? initialItems.find((t) => t.id === desktopSelectedId) ?? null;
  }, [desktopSelectedId, displayTests, initialItems]);

  const isDesktopViewport = useViewportMinWidth(1024);
  const n = displayTests.length;
  const tileColsDesktop = desktopClinicalTestsTileColumns(n);
  const tileColsMobile = mobileClinicalTestsTileColumns();
  const activeTileColumns = isDesktopViewport ? tileColsDesktop : tileColsMobile;

  const formTest = mobileSheet != null ? mobileSheet.test : testForDesktop;

  const assessmentKindSelectOptions = useMemo(
    () => buildClinicalAssessmentKindSelectOptions(assessmentKindCatalogItems, formTest?.assessmentKind ?? null),
    [assessmentKindCatalogItems, formTest?.assessmentKind],
  );

  const usageForSelection = useMemo(() => {
    const current = mobileSheet?.test ?? testForDesktop;
    if (!current || initialSelectedUsageSnapshot == null) return undefined;
    if (initialSelectedId === current.id) return initialSelectedUsageSnapshot;
    return undefined;
  }, [mobileSheet?.test, testForDesktop, initialSelectedId, initialSelectedUsageSnapshot]);

  const renderTestList = (
    list: ClinicalTest[],
    opts: { activeId: string | null; onRowSelect: (id: string) => void },
  ) =>
    list.length === 0 ? (
      <p className="px-2 pb-2 text-sm text-muted-foreground">Нет тестов по заданным фильтрам.</p>
    ) : (
      <ul className="flex h-full min-h-0 flex-col gap-1 overflow-y-auto">
        {list.map((t) => {
          const active = opts.activeId === t.id;
          return (
            <li key={t.id}>
              <div style={LIST_ROW_VISIBILITY_STYLE}>
                <button
                  type="button"
                  onClick={() => opts.onRowSelect(t.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-2 text-left text-sm hover:bg-muted",
                    active &&
                      "border-primary/25 bg-primary/15 text-primary hover:bg-primary/20 dark:bg-primary/20 dark:hover:bg-primary/25",
                  )}
                >
                  {mediaThumbRow(t)}
                  <span className="line-clamp-2">{t.title}</span>
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    );

  const renderTestTiles = (
    list: ClinicalTest[],
    opts: { activeId: string | null; onTileSelect: (id: string) => void; columns: number },
  ) =>
    list.length === 0 ? (
      <p className="px-2 text-sm text-muted-foreground">Нет тестов по заданным фильтрам.</p>
    ) : (
      <VirtualizedItemGrid
        items={list}
        columns={opts.columns}
        estimatedRowHeight={220}
        overscan={2}
        keyExtractor={(t) => t.id}
        containerClassName="h-full max-h-[70vh] lg:max-h-none"
        renderItem={(t) => (
          <div className="w-full min-w-0">
            <ClinicalTestTileCard
              test={t}
              onSelect={(id) => opts.onTileSelect(id)}
              isActive={opts.activeId === t.id}
            />
          </div>
        )}
      />
    );

  const pickRow = (id: string) => {
    const found = displayTests.find((t) => t.id === id) ?? null;
    setDesktopSelectedId(id);
    setMobileSheet(found ? { test: found } : null);
  };

  const rightPanel = (
    <CatalogRightPane className="h-full">
      <ClinicalTestForm
        test={formTest ?? undefined}
        saveAction={saveClinicalTestInline}
        archiveAction={archiveClinicalTestInline}
        unarchiveAction={unarchiveClinicalTestInline}
        workspaceView={viewMode}
        assessmentKindSelectOptions={assessmentKindSelectOptions}
        workspaceListPreserve={{
          q: filters.q,
          titleSort: filters.titleSort,
          regionCode: filters.regionCode,
          assessmentKind: filters.assessmentKind,
          listStatus: filters.listStatus,
        }}
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
              <DoctorCatalogFiltersForm
                idPrefix="ct"
                q={filters.q}
                regionCode={filters.regionCode}
                tertiaryFilter={{
                  items: assessmentKindFilterItems,
                  paramName: "assessment",
                  value: filters.assessmentKind ?? null,
                  label: "Вид оценки",
                  placeholder: "Все виды",
                  clearLabel: "Все виды",
                  summaryLabel: "Вид оценки",
                }}
                view={viewMode}
                titleSort={filters.titleSort}
                selectedId={desktopSelectedId}
              />
            </DoctorCatalogToolbarFiltersSlot>
          }
          end={
            <button
              type="button"
              id="doctor-clinical-tests-create"
              className={doctorCatalogToolbarPrimaryActionClassName}
              onClick={() => {
                setDesktopSelectedId(null);
                setMobileSheet({ test: null });
              }}
            >
              Создать тест
            </button>
          }
        />
      }
    >
      {filters.invalidAssessmentQuery ? (
        <p
          role="status"
          className="border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-950 dark:text-amber-100"
        >
          Параметр «Вид оценки» в адресе не распознан — фильтр по виду оценки не применён.
        </p>
      ) : null}
      {filters.invalidRegionQuery ? (
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
              <DoctorCatalogMasterListHeader
                summaryLine={displayTests.length === 0 ? "Нет тестов" : `Тестов: ${displayTests.length}`}
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
                "min-h-0 flex-1 overflow-hidden transition-opacity",
                isListPending && "opacity-80",
              )}
              aria-busy={isListPending}
            >
              {viewMode === "list"
                ? renderTestList(displayTests, {
                    activeId: desktopSelectedId,
                    onRowSelect: pickRow,
                  })
                : renderTestTiles(displayTests, {
                    activeId: desktopSelectedId,
                    onTileSelect: pickRow,
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

export function ClinicalTestsPageClient({
  initialItems,
  initialSelectedId,
  initialSelectedUsageSnapshot,
  initialViewMode,
  viewLockedByUrl,
  initialTitleSort,
  assessmentKindFilterItems,
  assessmentKindCatalogItems,
  bodyRegionIdToCode,
  filters,
}: Props) {
  const [viewMode, setViewMode] = useState<ClinicalTestsViewMode>(initialViewMode);
  const [toolbarViewMode, setToolbarViewMode] = useState<ClinicalTestsViewMode>(initialViewMode);
  const [titleSort, setTitleSort] = useState<ClinicalTestTitleSort | null>(initialTitleSort);
  const [desktopSelectedId, setDesktopSelectedId] = useState<string | null>(null);
  const [mobileSheet, setMobileSheet] = useState<{ test: ClinicalTest | null } | null>(null);
  const [isListPending, startListTransition] = useTransition();

  useEffect(() => {
    if (viewLockedByUrl) {
      setViewMode(initialViewMode);
      setToolbarViewMode(initialViewMode);
      return;
    }
    const saved = readDoctorCatalogViewPreference(doctorCatalogViewStorageKey.clinicalTests);
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
    writeDoctorCatalogViewPreference(doctorCatalogViewStorageKey.clinicalTests, next);
    startListTransition(() => {
      setViewMode(next);
    });
  };

  const changeTitleSort = (next: ClinicalTestTitleSort | null) => {
    startListTransition(() => {
      setTitleSort(next);
    });
  };

  const filterScope = useMemo(() => ({ ...filters, titleSort }), [filters, titleSort]);
  const mergedFilters = useDoctorCatalogClientFilterMerge(filterScope);

  return (
    <ClinicalTestsContent
      initialItems={initialItems}
      initialSelectedId={initialSelectedId}
      initialSelectedUsageSnapshot={initialSelectedUsageSnapshot}
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
      assessmentKindFilterItems={assessmentKindFilterItems}
      assessmentKindCatalogItems={assessmentKindCatalogItems}
      bodyRegionIdToCode={bodyRegionIdToCode}
    />
  );
}
