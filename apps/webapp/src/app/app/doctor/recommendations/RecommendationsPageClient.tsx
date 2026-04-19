"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Recommendation } from "@/modules/recommendations/types";
import { cn } from "@/lib/utils";
import { normalizeRuSearchString } from "@/shared/lib/ruSearchNormalize";
import {
  DOCTOR_CATALOG_STICKY_BAR_CLASS,
  DOCTOR_STICKY_PAGE_TOOLBAR_TOP_CLASS,
} from "@/shared/ui/doctorWorkspaceLayout";
import { CatalogLeftPane } from "@/shared/ui/CatalogLeftPane";
import { CatalogSplitLayout } from "@/shared/ui/CatalogSplitLayout";
import { DoctorCatalogPageLayout } from "@/shared/ui/DoctorCatalogPageLayout";
import { PickerSearchField } from "@/shared/ui/PickerSearchField";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

  const displayList = useMemo(() => {
    let out = initialItems;
    const needle = normalizeRuSearchString(searchQuery.trim());
    if (needle) {
      out = out.filter((r) => normalizeRuSearchString(r.title).includes(needle));
    }
    if (titleSort === "asc" || titleSort === "desc") {
      out = [...out].sort((a, b) => {
        const cmp = a.title.localeCompare(b.title, "ru", { sensitivity: "base" });
        return titleSort === "asc" ? cmp : -cmp;
      });
    }
    return out;
  }, [initialItems, searchQuery, titleSort]);

  useEffect(() => {
    queueMicrotask(() => {
      if (creating) return;
      if (displayList.length === 0) {
        setSelectedId(null);
        setMobileSheet(null);
        return;
      }
      setSelectedId((cur) => {
        if (cur != null && displayList.some((r) => r.id === cur)) return cur;
        return displayList[0]!.id;
      });
      setMobileSheet((prev) => {
        if (prev == null) return prev;
        const next = displayList.find((r) => r.id === prev.id);
        return next ?? null;
      });
    });
  }, [creating, displayList]);

  const selected =
    creating ? null : (displayList.find((r) => r.id === selectedId) ?? (displayList.length > 0 ? displayList[0]! : null));

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
      <p className="text-sm text-muted-foreground">Выберите запись слева или создайте новую.</p>
    );

  const desktopRight = (
    <Card className="flex min-h-0 min-w-0 flex-col overflow-hidden">
      <CardContent className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">{rightInner}</CardContent>
    </Card>
  );

  const mobileDetailOpen = creating || mobileSheet != null;

  const toolbar = (
    <div className={cn(DOCTOR_CATALOG_STICKY_BAR_CLASS, DOCTOR_STICKY_PAGE_TOOLBAR_TOP_CLASS)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-3">
        <p className="min-w-0 shrink-0 truncate text-xs text-muted-foreground">
          {displayList.length === 0 ? "Нет записей" : `Записей: ${displayList.length}`}
        </p>
        <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:max-w-full sm:flex-row sm:items-end sm:justify-end">
          <PickerSearchField
            id={searchFieldId}
            label="Поиск по названию"
            placeholder="Название"
            value={searchQuery}
            onValueChange={setSearchQuery}
            className="min-w-0 sm:max-w-[14rem] sm:flex-initial"
          />
          <div className="flex min-w-[11rem] max-w-full flex-col gap-1 sm:max-w-[14rem] sm:flex-initial">
            <span className="text-[11px] text-muted-foreground sm:sr-only">Сортировка</span>
            <Select value={titleSort} onValueChange={(v) => setTitleSort(v as RecommendationTitleSort)}>
              <SelectTrigger size="sm" className="h-8 w-full text-left">
                <SelectValue>
                  {titleSort === "asc"
                    ? "Название А→Я"
                    : titleSort === "desc"
                      ? "Название Я→А"
                      : "Сортировка"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">По дате изменения</SelectItem>
                <SelectItem value="asc">Название А→Я</SelectItem>
                <SelectItem value="desc">Название Я→А</SelectItem>
              </SelectContent>
            </Select>
          </div>
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
      </div>
    </div>
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
