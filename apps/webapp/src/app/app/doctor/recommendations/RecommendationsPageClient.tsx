"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  RECOMMENDATION_DOMAIN_ITEMS,
  type RecommendationDomain,
} from "@/modules/recommendations/recommendationDomain";
import type {
  Recommendation,
  RecommendationMediaItem,
  RecommendationUsageSnapshot,
} from "@/modules/recommendations/types";
import { cn } from "@/lib/utils";
import { useViewportMinWidth } from "@/shared/hooks/useViewportMinWidth";
import {
  doctorCatalogViewStorageKey,
  readDoctorCatalogViewPreference,
  writeDoctorCatalogViewPreference,
} from "@/shared/lib/doctorCatalogViewPreference";
import { MediaThumb } from "@/shared/ui/media/MediaThumb";
import { recommendationMediaItemToPreviewUi } from "@/shared/ui/media/mediaPreviewUiModel";
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
import {
  DoctorCatalogFiltersForm,
  type DoctorCatalogTertiaryFilter,
} from "@/shared/ui/doctor/DoctorCatalogFiltersForm";
import { RecommendationForm } from "./RecommendationForm";
import { archiveRecommendationInline, saveRecommendationInline } from "./actionsInline";
export type RecommendationsViewMode = "tiles" | "list";
export type RecommendationTitleSort = "asc" | "desc";

const LIST_ROW_VISIBILITY_STYLE = {
  contentVisibility: "auto",
  containIntrinsicSize: "52px",
} as const;

type Props = {
  initialItems: Recommendation[];
  initialSelectedId: string | null;
  initialSelectedUsageSnapshot: RecommendationUsageSnapshot | null;
  initialViewMode: RecommendationsViewMode;
  viewLockedByUrl: boolean;
  initialTitleSort: RecommendationTitleSort | null;
  filters: {
    q: string;
    regionRefId?: string;
    domain?: RecommendationDomain;
  };
};

function desktopRecommendationsTileColumns(count: number): number {
  if (count <= 3) return 3;
  if (count === 4) return 4;
  if (count <= 7) return 3;
  return 4;
}

function mobileRecommendationsTileColumns(): number {
  return 3;
}

function firstRecommendationMedia(r: Recommendation) {
  if (!r.media?.length) return null;
  return [...r.media].sort((a, b) => a.sortOrder - b.sortOrder)[0];
}

/** Список/плитка: в JSON нет previewSm у рекомендаций — для image/gif подставляем исходный URL; для video — элемент video. */
function RecommendationCatalogMediaThumb({
  media,
  className,
  imgClassName,
  sizes,
}: {
  media: RecommendationMediaItem;
  className?: string;
  imgClassName?: string;
  sizes?: string;
}) {
  if (media.mediaType === "video") {
    return (
      <div className={cn("relative overflow-hidden bg-muted/30", className)}>
        <video
          src={media.mediaUrl}
          muted
          playsInline
          preload="metadata"
          className={cn("size-full object-cover", imgClassName)}
          aria-hidden
        />
      </div>
    );
  }
  return (
    <MediaThumb
      media={recommendationMediaItemToPreviewUi(media)}
      className={className}
      imgClassName={imgClassName}
      sizes={sizes}
    />
  );
}

function RecommendationTileCard({
  recommendation: r,
  onSelect,
  isActive,
}: {
  recommendation: Recommendation;
  onSelect: (id: string) => void;
  isActive: boolean;
}) {
  const firstMedia = firstRecommendationMedia(r);
  return (
    <button
      type="button"
      className="flex w-full cursor-pointer justify-center rounded-xl border-0 bg-transparent p-0 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      onClick={() => onSelect(r.id)}
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
              <RecommendationCatalogMediaThumb
                media={firstMedia}
                className="h-full w-full"
                imgClassName="h-full w-full object-cover"
                sizes="160px"
              />
            </div>
          ) : null}
          <p className="line-clamp-2 px-0.5 text-center text-xs leading-snug text-foreground">{r.title}</p>
          {r.isArchived ? (
            <p className="line-clamp-1 px-0.5 text-center text-[10px] text-muted-foreground">В архиве</p>
          ) : null}
        </CardContent>
      </Card>
    </button>
  );
}

function mediaThumbRow(r: Recommendation) {
  const m = firstRecommendationMedia(r);
  if (!m) {
    return <div className="h-9 w-9 shrink-0 rounded bg-muted" aria-hidden />;
  }
  return (
    <RecommendationCatalogMediaThumb
      media={m}
      className="relative h-9 w-9 shrink-0 rounded border border-border/40 bg-muted/30"
      imgClassName="size-full object-cover"
      sizes="36px"
    />
  );
}

function RecommendationsContent({
  initialItems,
  initialSelectedId,
  initialSelectedUsageSnapshot,
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
}: {
  initialItems: Recommendation[];
  initialSelectedId: string | null;
  initialSelectedUsageSnapshot: RecommendationUsageSnapshot | null;
  viewMode: RecommendationsViewMode;
  toolbarViewMode: RecommendationsViewMode;
  titleSort: RecommendationTitleSort | null;
  desktopSelectedId: string | null;
  mobileSheet: { recommendation: Recommendation | null } | null;
  isListPending: boolean;
  setDesktopSelectedId: (id: string | null) => void;
  setMobileSheet: (sheet: { recommendation: Recommendation | null } | null) => void;
  toggleViewMode: () => void;
  changeTitleSort: (next: RecommendationTitleSort | null) => void;
  filters: Props["filters"];
}) {
  useEffect(() => {
    if (!initialSelectedId) return;
    const found = initialItems.find((r) => r.id === initialSelectedId);
    if (!found) return;
    queueMicrotask(() => {
      setDesktopSelectedId(found.id);
      setMobileSheet({ recommendation: found });
    });
  }, [initialSelectedId, initialItems, setDesktopSelectedId, setMobileSheet]);

  const displayRecommendations = useMemo(() => {
    if (!titleSort) return initialItems;
    return [...initialItems].sort((a, b) => {
      const cmp = a.title.localeCompare(b.title, "ru", { sensitivity: "base" });
      return titleSort === "asc" ? cmp : -cmp;
    });
  }, [initialItems, titleSort]);

  useEffect(() => {
    if (!desktopSelectedId) return;
    const inList = displayRecommendations.some((r) => r.id === desktopSelectedId);
    const fromInitial = initialItems.some((r) => r.id === desktopSelectedId);
    if (!inList && !fromInitial) setDesktopSelectedId(null);
  }, [desktopSelectedId, displayRecommendations, initialItems, setDesktopSelectedId]);

  const recommendationForDesktop = useMemo(() => {
    if (!desktopSelectedId) return null;
    return (
      displayRecommendations.find((r) => r.id === desktopSelectedId) ??
      initialItems.find((r) => r.id === desktopSelectedId) ??
      null
    );
  }, [desktopSelectedId, displayRecommendations, initialItems]);

  const isDesktopViewport = useViewportMinWidth(1024);
  const n = displayRecommendations.length;
  const tileColsDesktop = desktopRecommendationsTileColumns(n);
  const tileColsMobile = mobileRecommendationsTileColumns();
  const activeTileColumns = isDesktopViewport ? tileColsDesktop : tileColsMobile;

  const formRecommendation = mobileSheet != null ? mobileSheet.recommendation : recommendationForDesktop;

  const usageForSelection = (() => {
    const current = formRecommendation;
    if (!current || initialSelectedUsageSnapshot == null) return undefined;
    if (initialSelectedId === current.id) return initialSelectedUsageSnapshot;
    return undefined;
  })();

  const recommendationTertiaryFilter = useMemo((): DoctorCatalogTertiaryFilter => {
    return {
      items: RECOMMENDATION_DOMAIN_ITEMS,
      paramName: "domain",
      value: filters.domain ?? null,
      label: "Область",
      placeholder: "Все области",
      clearLabel: "Все области",
      summaryLabel: "Область",
    };
  }, [filters.domain]);

  const renderRecommendationList = (
    list: Recommendation[],
    opts: { activeId: string | null; onRowSelect: (id: string) => void },
  ) =>
    list.length === 0 ? (
      <p className="px-2 pb-2 text-sm text-muted-foreground">Нет рекомендаций по заданным фильтрам.</p>
    ) : (
      <ul className="flex h-full min-h-0 flex-col gap-1 overflow-y-auto">
        {list.map((r) => {
          const active = opts.activeId === r.id;
          return (
            <li key={r.id}>
              <div style={LIST_ROW_VISIBILITY_STYLE}>
                <button
                  type="button"
                  onClick={() => opts.onRowSelect(r.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-2 text-left text-sm hover:bg-muted",
                    active &&
                      "border-primary/25 bg-primary/15 text-primary hover:bg-primary/20 dark:bg-primary/20 dark:hover:bg-primary/25",
                  )}
                >
                  {mediaThumbRow(r)}
                  <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
                    <span className="line-clamp-2">{r.title}</span>
                    {r.isArchived ? (
                      <span className="text-xs text-muted-foreground">В архиве</span>
                    ) : null}
                  </span>
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    );

  const renderRecommendationTiles = (
    list: Recommendation[],
    opts: { activeId: string | null; onTileSelect: (id: string) => void; columns: number },
  ) =>
    list.length === 0 ? (
      <p className="px-2 text-sm text-muted-foreground">Нет рекомендаций по заданным фильтрам.</p>
    ) : (
      <VirtualizedItemGrid
        items={list}
        columns={opts.columns}
        estimatedRowHeight={220}
        overscan={2}
        keyExtractor={(r) => r.id}
        containerClassName="h-full max-h-[70vh] lg:max-h-none"
        renderItem={(r) => (
          <div className="w-full min-w-0">
            <RecommendationTileCard
              recommendation={r}
              onSelect={(id) => opts.onTileSelect(id)}
              isActive={opts.activeId === r.id}
            />
          </div>
        )}
      />
    );

  const pickRow = (id: string) => {
    const found = displayRecommendations.find((r) => r.id === id) ?? null;
    setDesktopSelectedId(id);
    setMobileSheet(found ? { recommendation: found } : null);
  };

  const rightPanel = (
    <CatalogRightPane className="h-full">
      <RecommendationForm
        recommendation={formRecommendation ?? undefined}
        saveAction={saveRecommendationInline}
        archiveAction={archiveRecommendationInline}
        workspaceView={viewMode}
        workspaceListPreserve={{
          q: filters.q,
          titleSort,
          regionRefId: filters.regionRefId,
          domain: filters.domain,
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
                key={`rec-filters-${filters.q}-${filters.regionRefId ?? ""}-${filters.domain ?? ""}`}
                idPrefix="rec"
                q={filters.q}
                regionRefId={filters.regionRefId}
                tertiaryFilter={recommendationTertiaryFilter}
                view={viewMode}
                titleSort={titleSort}
                selectedId={desktopSelectedId}
              />
            </DoctorCatalogToolbarFiltersSlot>
          }
          end={
            <button
              type="button"
              id="doctor-recommendations-create"
              className={doctorCatalogToolbarPrimaryActionClassName}
              onClick={() => {
                setDesktopSelectedId(null);
                setMobileSheet({ recommendation: null });
              }}
            >
              Создать рекомендацию
            </button>
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
                  displayRecommendations.length === 0
                    ? "Нет рекомендаций"
                    : `Рекомендаций: ${displayRecommendations.length}`
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
                ? renderRecommendationList(displayRecommendations, {
                    activeId: desktopSelectedId,
                    onRowSelect: pickRow,
                  })
                : renderRecommendationTiles(displayRecommendations, {
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

export function RecommendationsPageClient({
  initialItems,
  initialSelectedId,
  initialSelectedUsageSnapshot,
  initialViewMode,
  viewLockedByUrl,
  initialTitleSort,
  filters,
}: Props) {
  const [viewMode, setViewMode] = useState<RecommendationsViewMode>(initialViewMode);
  const [toolbarViewMode, setToolbarViewMode] = useState<RecommendationsViewMode>(initialViewMode);
  const [titleSort, setTitleSort] = useState<RecommendationTitleSort | null>(initialTitleSort);
  const [desktopSelectedId, setDesktopSelectedId] = useState<string | null>(null);
  const [mobileSheet, setMobileSheet] = useState<{ recommendation: Recommendation | null } | null>(null);
  const [isListPending, startListTransition] = useTransition();

  useEffect(() => {
    if (viewLockedByUrl) {
      setViewMode(initialViewMode);
      setToolbarViewMode(initialViewMode);
      return;
    }
    const saved = readDoctorCatalogViewPreference(doctorCatalogViewStorageKey.recommendations);
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
    writeDoctorCatalogViewPreference(doctorCatalogViewStorageKey.recommendations, next);
    startListTransition(() => {
      setViewMode(next);
    });
  };

  const changeTitleSort = (next: RecommendationTitleSort | null) => {
    startListTransition(() => {
      setTitleSort(next);
    });
  };

  return (
    <RecommendationsContent
      initialItems={initialItems}
      initialSelectedId={initialSelectedId}
      initialSelectedUsageSnapshot={initialSelectedUsageSnapshot}
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
  );
}
