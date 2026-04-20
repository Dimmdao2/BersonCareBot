"use client";

import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Recommendation } from "@/modules/recommendations/types";
import { cn } from "@/lib/utils";
import { useDoctorCatalogDisplayList } from "@/shared/hooks/useDoctorCatalogDisplayList";
import { useDoctorCatalogMasterSelectionSync } from "@/shared/hooks/useDoctorCatalogMasterSelectionSync";
import { DoctorCatalogStickyToolbar } from "@/shared/ui/doctor/DoctorCatalogStickyToolbar";
import { DoctorCatalogTitleSortSelect } from "@/shared/ui/doctor/DoctorCatalogTitleSortSelect";
import { DoctorCatalogToolbarMainRow } from "@/shared/ui/doctor/DoctorCatalogToolbarLayout";
import { CatalogLeftPane } from "@/shared/ui/CatalogLeftPane";
import { CatalogRightPane } from "@/shared/ui/CatalogRightPane";
import { CatalogSplitLayout } from "@/shared/ui/CatalogSplitLayout";
import { DoctorCatalogPageLayout } from "@/shared/ui/DoctorCatalogPageLayout";
import { PickerSearchField } from "@/shared/ui/PickerSearchField";
import { RecommendationForm } from "./RecommendationForm";
import { archiveRecommendationInline, saveRecommendationInline } from "./actionsInline";
import { RECOMMENDATIONS_PATH } from "./paths";

export type RecommendationTitleSort = "default" | "asc" | "desc";

type Props = {
  initialItems: Recommendation[];
  initialSelectedId: string | null;
};

export function RecommendationsPageClient({ initialItems, initialSelectedId }: Props) {
  const searchFieldId = useId();
  const [searchQuery, setSearchQuery] = useState("");
  const [titleSort, setTitleSort] = useState<RecommendationTitleSort>("default");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [mobileSheet, setMobileSheet] = useState<Recommendation | null>(null);

  useEffect(() => {
    queueMicrotask(() => {
      if (initialSelectedId) {
        const found = initialItems.find((r) => r.id === initialSelectedId);
        if (found) {
          setSelectedId(found.id);
          setCreating(false);
          setMobileSheet(found);
        }
      }
    });
  }, [initialSelectedId, initialItems]);

  const displayList = useDoctorCatalogDisplayList(initialItems, searchQuery, titleSort);

  useDoctorCatalogMasterSelectionSync({
    displayList,
    setSelectedId,
    setMobileItem: setMobileSheet,
    suspend: creating,
    fallbackToFirst: false,
  });

  const selected = creating ? null : (displayList.find((r) => r.id === selectedId) ?? null);

  const renderRows = (onPick: (r: Recommendation) => void, activeId: string | null) =>
    displayList.length === 0 ? (
      <p className="px-2 pb-2 text-sm text-muted-foreground">Нет записей по заданным условиям.</p>
    ) : (
      <ul className="flex max-h-[70vh] flex-col gap-1 overflow-auto lg:max-h-none lg:overflow-visible">
        {displayList.map((r) => {
          const active = activeId === r.id;
          return (
            <li key={r.id} className="rounded-md border border-border/40 bg-card/30">
              <button
                type="button"
                onClick={() => {
                  setCreating(false);
                  onPick(r);
                }}
                className={cn(
                  "flex w-full items-start rounded-md border border-transparent px-2 py-2 text-left text-sm hover:bg-muted/80",
                  active &&
                    "border-primary/25 bg-primary/15 text-primary hover:bg-primary/20 dark:bg-primary/20 dark:hover:bg-primary/25",
                )}
              >
                <span className="line-clamp-2 font-medium leading-tight">{r.title}</span>
              </button>
            </li>
          );
        })}
      </ul>
    );

  const rightInner =
    creating ? (
      <RecommendationForm
        recommendation={null}
        saveAction={saveRecommendationInline}
        archiveAction={archiveRecommendationInline}
        backHref={RECOMMENDATIONS_PATH}
      />
    ) : selected ? (
      <RecommendationForm
        recommendation={selected}
        saveAction={saveRecommendationInline}
        archiveAction={archiveRecommendationInline}
        backHref={RECOMMENDATIONS_PATH}
      />
    ) : (
      <RecommendationForm
        recommendation={null}
        saveAction={saveRecommendationInline}
        archiveAction={archiveRecommendationInline}
        backHref={RECOMMENDATIONS_PATH}
      />
    );

  const desktopRight = <CatalogRightPane>{rightInner}</CatalogRightPane>;

  const mobileDetailOpen = creating || mobileSheet != null;

  const toolbar = (
    <DoctorCatalogStickyToolbar>
      <DoctorCatalogToolbarMainRow
        start={
          <>
            <PickerSearchField
              id={searchFieldId}
              label="Поиск по названию"
              placeholder="Название"
              value={searchQuery}
              onValueChange={setSearchQuery}
              className="min-w-0 sm:max-w-[14rem] sm:flex-initial"
            />
            <DoctorCatalogTitleSortSelect
              value={titleSort}
              onValueChange={(v) => setTitleSort(v as RecommendationTitleSort)}
            />
          </>
        }
        end={
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <p className="min-w-0 shrink-0 truncate text-xs text-muted-foreground">
              {displayList.length === 0 ? "Нет записей" : `Записей: ${displayList.length}`}
            </p>
            <Button
              type="button"
              size="sm"
              className="shrink-0"
              onClick={() => {
                setCreating(true);
                setSelectedId(null);
                setMobileSheet(null);
              }}
            >
              Создать рекомендацию
            </Button>
          </div>
        }
      />
    </DoctorCatalogStickyToolbar>
  );

  return (
    <DoctorCatalogPageLayout toolbar={toolbar}>
      <CatalogSplitLayout
        left={
          <CatalogLeftPane>
            {renderRows((r) => {
              setCreating(false);
              setSelectedId(r.id);
              setMobileSheet(r);
            }, creating ? null : selected?.id ?? mobileSheet?.id ?? null)}
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
