"use client";

import { useCallback, useEffect, useId, useMemo, useState, useTransition } from "react";
import { LayoutGrid, List } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ClinicalTest } from "@/modules/tests/types";
import { cn } from "@/lib/utils";
import { useViewportMinWidth } from "@/shared/hooks/useViewportMinWidth";
import { PickerSearchField } from "@/shared/ui/PickerSearchField";
import { MediaThumb } from "@/shared/ui/media/MediaThumb";
import { clinicalTestMediaItemToPreviewUi } from "@/shared/ui/media/mediaPreviewUiModel";
import { VirtualizedItemGrid } from "@/shared/ui/VirtualizedItemGrid";
import { useDoctorCatalogDisplayList } from "@/shared/hooks/useDoctorCatalogDisplayList";
import { DoctorCatalogStickyToolbar } from "@/shared/ui/doctor/DoctorCatalogStickyToolbar";
import { DoctorCatalogTitleSortSelect, type TitleSortValue } from "@/shared/ui/doctor/DoctorCatalogTitleSortSelect";
import { DoctorCatalogToolbarMainRow } from "@/shared/ui/doctor/DoctorCatalogToolbarLayout";
import { CatalogLeftPane } from "@/shared/ui/CatalogLeftPane";
import { CatalogRightPane } from "@/shared/ui/CatalogRightPane";
import { CatalogSplitLayout } from "@/shared/ui/CatalogSplitLayout";
import { DoctorCatalogPageLayout } from "@/shared/ui/DoctorCatalogPageLayout";
import { ClinicalTestForm } from "./ClinicalTestForm";
import { archiveClinicalTestInline, saveClinicalTestInline } from "./actionsInline";
import { CLINICAL_TESTS_PATH } from "./paths";

export type ClinicalTestsViewMode = "tiles" | "list";
export type ClinicalTestTitleSort = "asc" | "desc";

const LIST_ROW_VISIBILITY_STYLE = {
  contentVisibility: "auto",
  containIntrinsicSize: "52px",
} as const;

type Props = {
  initialItems: ClinicalTest[];
  initialSelectedId: string | null;
  initialViewMode: ClinicalTestsViewMode;
};

function desktopCatalogTileColumns(count: number): number {
  if (count <= 1) return 1;
  if (count === 2) return 2;
  if (count === 3) return 3;
  if (count === 4) return 4;
  if (count <= 7) return 3;
  return 4;
}

function mobileCatalogTileColumns(count: number): number {
  if (count <= 1) return 1;
  if (count === 2 || count === 4) return 2;
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

export function ClinicalTestsPageClient({
  initialItems,
  initialSelectedId,
  initialViewMode,
}: Props) {
  const searchFieldId = useId();
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ClinicalTestsViewMode>(initialViewMode);
  const [toolbarViewMode, setToolbarViewMode] = useState<ClinicalTestsViewMode>(initialViewMode);
  const [titleSort, setTitleSort] = useState<ClinicalTestTitleSort | null>(null);
  const [desktopSelectedId, setDesktopSelectedId] = useState<string | null>(null);
  const [mobileSheet, setMobileSheet] = useState<{ test: ClinicalTest | null } | null>(null);
  const [isListPending, startListTransition] = useTransition();

  useEffect(() => {
    setViewMode(initialViewMode);
    setToolbarViewMode(initialViewMode);
  }, [initialViewMode]);

  useEffect(() => {
    queueMicrotask(() => {
      if (!initialSelectedId) return;
      const found = initialItems.find((t) => t.id === initialSelectedId);
      if (found) {
        setDesktopSelectedId(found.id);
        setMobileSheet({ test: found });
      }
    });
  }, [initialSelectedId, initialItems]);

  const toggleViewMode = () => {
    const next = toolbarViewMode === "tiles" ? "list" : "tiles";
    setToolbarViewMode(next);
    startListTransition(() => {
      setViewMode(next);
    });
  };

  const changeTitleSort = (next: ClinicalTestTitleSort | null) => {
    startListTransition(() => {
      setTitleSort(next);
    });
  };

  const titleSortForList: TitleSortValue =
    titleSort === "asc" || titleSort === "desc" ? titleSort : "default";
  const displayTests = useDoctorCatalogDisplayList(initialItems, searchQuery, titleSortForList);

  useEffect(() => {
    if (!desktopSelectedId) return;
    const inList = displayTests.some((t) => t.id === desktopSelectedId);
    const fromInitial = initialItems.some((t) => t.id === desktopSelectedId);
    if (!inList && !fromInitial) setDesktopSelectedId(null);
  }, [desktopSelectedId, displayTests, initialItems]);

  const testForDesktop = useMemo(() => {
    if (!desktopSelectedId) return null;
    return displayTests.find((t) => t.id === desktopSelectedId) ?? initialItems.find((t) => t.id === desktopSelectedId) ?? null;
  }, [desktopSelectedId, displayTests, initialItems]);

  const isDesktopViewport = useViewportMinWidth(1024);
  const n = displayTests.length;
  const tileColsDesktop = desktopCatalogTileColumns(n);
  const tileColsMobile = mobileCatalogTileColumns(n);
  const activeTileColumns = isDesktopViewport ? tileColsDesktop : tileColsMobile;

  const formTest = mobileSheet != null ? mobileSheet.test : testForDesktop;

  const renderTestList = (
    list: ClinicalTest[],
    opts: { activeId: string | null; onRowSelect: (id: string) => void },
  ) =>
    list.length === 0 ? (
      <p className="px-2 pb-2 text-sm text-muted-foreground">Нет тестов по заданным условиям.</p>
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
      <p className="px-2 text-sm text-muted-foreground">Нет тестов по заданным условиям.</p>
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

  const pickRow = useCallback(
    (id: string) => {
      const found = displayTests.find((t) => t.id === id) ?? null;
      setDesktopSelectedId(id);
      setMobileSheet(found ? { test: found } : null);
    },
    [displayTests],
  );

  const rightPanel = (
    <CatalogRightPane>
      <ClinicalTestForm
        test={formTest ?? undefined}
        saveAction={saveClinicalTestInline}
        archiveAction={archiveClinicalTestInline}
        backHref={CLINICAL_TESTS_PATH}
        workspaceView={viewMode}
      />
    </CatalogRightPane>
  );

  return (
    <DoctorCatalogPageLayout
      toolbar={
        <DoctorCatalogStickyToolbar>
          <DoctorCatalogToolbarMainRow
            start={
              <>
                <PickerSearchField
                  id={searchFieldId}
                  label="Поиск по названию"
                  placeholder="Название теста"
                  value={searchQuery}
                  onValueChange={setSearchQuery}
                  className="min-w-0 sm:max-w-[min(24rem,100%)] sm:flex-initial"
                />
                <DoctorCatalogTitleSortSelect
                  value={titleSortForList}
                  onValueChange={(v) => {
                    if (v === "default") changeTitleSort(null);
                    else changeTitleSort(v as ClinicalTestTitleSort);
                  }}
                />
              </>
            }
            end={
              <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                <p className="min-w-0 shrink-0 truncate text-xs text-muted-foreground">
                  {displayTests.length === 0 ? "Нет тестов" : `Тестов: ${displayTests.length}`}
                </p>
                <div className="flex shrink-0 items-center justify-end gap-2">
                  <button
                    type="button"
                    id="doctor-clinical-tests-create"
                    className={buttonVariants({ size: "sm" })}
                    onClick={() => {
                      setDesktopSelectedId(null);
                      setMobileSheet({ test: null });
                    }}
                  >
                    Создать тест
                  </button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className={cn("shrink-0 transition-opacity", isListPending && "opacity-70")}
                    aria-label={toolbarViewMode === "tiles" ? "Показать список" : "Показать плитки"}
                    title={toolbarViewMode === "tiles" ? "Список" : "Плитки"}
                    onClick={toggleViewMode}
                    aria-busy={isListPending}
                  >
                    {toolbarViewMode === "tiles" ? (
                      <List className="size-4" aria-hidden />
                    ) : (
                      <LayoutGrid className="size-4" aria-hidden />
                    )}
                  </Button>
                </div>
              </div>
            }
          />
        </DoctorCatalogStickyToolbar>
      }
    >
      <CatalogSplitLayout
        left={
          <CatalogLeftPane stickyToolbarRows={1}>
            <div
              className={cn(
                "flex min-h-0 flex-1 flex-col overflow-hidden transition-opacity",
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
