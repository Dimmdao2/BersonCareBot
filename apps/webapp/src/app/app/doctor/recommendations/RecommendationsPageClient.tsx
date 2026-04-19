"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Recommendation } from "@/modules/recommendations/types";
import { cn } from "@/lib/utils";
import { normalizeRuSearchString } from "@/shared/lib/ruSearchNormalize";
import { DOCTOR_DESKTOP_SPLIT_PANE_MAX_H_CLASS } from "@/shared/ui/doctorWorkspaceLayout";
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

function RecommendationListToolbar({
  itemCount,
  searchQuery,
  onSearchChange,
  titleSort,
  onTitleSortChange,
  onCreate,
}: {
  itemCount: number;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  titleSort: RecommendationTitleSort;
  onTitleSortChange: (next: RecommendationTitleSort) => void;
  onCreate: () => void;
}) {
  const searchFieldId = useId();
  return (
    <div className="flex flex-col gap-2 border-b border-border/60 px-2 pb-2 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
      <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
        {itemCount === 0 ? "Нет записей" : `Записей: ${itemCount}`}
      </p>
      <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:max-w-full sm:flex-row sm:items-end sm:justify-end">
        <PickerSearchField
          id={searchFieldId}
          label="Поиск по названию"
          placeholder="Название"
          value={searchQuery}
          onValueChange={onSearchChange}
          className="min-w-0 sm:max-w-[14rem] sm:flex-initial"
        />
        <div className="flex min-w-[11rem] max-w-full flex-col gap-1 sm:max-w-[14rem] sm:flex-initial">
          <span className="text-[11px] text-muted-foreground sm:sr-only">Сортировка</span>
          <Select value={titleSort} onValueChange={(v) => onTitleSortChange(v as RecommendationTitleSort)}>
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
        <Button type="button" size="sm" className="shrink-0" onClick={onCreate}>
          Создать рекомендацию
        </Button>
      </div>
    </div>
  );
}

export function RecommendationsPageClient({ initialItems, initialSelectedId }: Props) {
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

  const toolbarProps = {
    itemCount: displayList.length,
    searchQuery,
    onSearchChange: setSearchQuery,
    titleSort,
    onTitleSortChange: setTitleSort,
    onCreate: () => {
      setCreating(true);
      setSelectedId(null);
      setMobileSheet(null);
    },
  };

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

  return (
    <div className="flex flex-col gap-4">
      <div className="hidden lg:block">
        <div className={cn("grid items-stretch gap-4 lg:grid-cols-2", DOCTOR_DESKTOP_SPLIT_PANE_MAX_H_CLASS)}>
          <aside className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
            <div className="shrink-0 p-2 pb-0">
              <RecommendationListToolbar {...toolbarProps} />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2 pt-2">
              {renderRows((r) => setSelectedId(r.id), creating ? null : selected?.id ?? null)}
            </div>
          </aside>
          {desktopRight}
        </div>
      </div>

      <div className="relative min-h-[40vh] overflow-hidden lg:hidden">
        <div
          className={cn(
            "transition-transform duration-300 ease-out",
            mobileDetailOpen ? "-translate-x-full" : "translate-x-0",
          )}
        >
          <aside className="rounded-xl border border-border bg-card p-2">
            <RecommendationListToolbar {...toolbarProps} />
            {renderRows((r) => {
              setCreating(false);
              setSelectedId(r.id);
              setMobileSheet(r);
            }, mobileSheet?.id ?? null)}
          </aside>
        </div>

        <div
          className={cn(
            "absolute inset-0 z-10 overflow-y-auto bg-background px-1 pb-6 pt-2 transition-transform duration-300 ease-out",
            mobileDetailOpen ? "translate-x-0" : "translate-x-full",
          )}
        >
          {mobileDetailOpen ? (
            <>
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
              <Card className="min-w-0 border-0 shadow-none sm:border sm:shadow-sm">
                <CardContent className="p-2 sm:p-4">
                  {creating ? (
                    <RecommendationForm
                      recommendation={null}
                      saveAction={saveRecommendationInline}
                      archiveAction={archiveRecommendationInline}
                      backHref={RECOMMENDATIONS_PATH}
                    />
                  ) : mobileSheet ? (
                    <RecommendationForm
                      recommendation={mobileSheet}
                      saveAction={saveRecommendationInline}
                      archiveAction={archiveRecommendationInline}
                      backHref={RECOMMENDATIONS_PATH}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">Нет данных.</p>
                  )}
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
