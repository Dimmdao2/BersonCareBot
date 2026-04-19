"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ExerciseMedia } from "@/modules/lfk-exercises/types";
import type { Template, TemplateStatus } from "@/modules/lfk-templates/types";
import { cn } from "@/lib/utils";
import { normalizeRuSearchString } from "@/shared/lib/ruSearchNormalize";
import { PickerSearchField } from "@/shared/ui/PickerSearchField";
import { MediaThumb } from "@/shared/ui/media/MediaThumb";
import { exerciseMediaToPreviewUi } from "@/shared/ui/media/mediaPreviewUiModel";
import { DOCTOR_DESKTOP_SPLIT_PANE_MAX_H_CLASS } from "@/shared/ui/doctorWorkspaceLayout";
import { TemplateEditor } from "./TemplateEditor";

export type LfkTemplateTitleSort = "default" | "asc" | "desc";

type Props = {
  templates: Template[];
  exerciseCatalog: Array<{ id: string; title: string; firstMedia: ExerciseMedia | null }>;
};

function statusEyeMeta(status: TemplateStatus) {
  const published = status === "published";
  const archived = status === "archived";
  const label = archived ? "В архиве" : published ? "Опубликован" : "Черновик";
  return { published, label };
}

function TemplateListToolbar({
  templateCount,
  searchQuery,
  onSearchChange,
  titleSort,
  onTitleSortChange,
}: {
  templateCount: number;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  titleSort: LfkTemplateTitleSort;
  onTitleSortChange: (next: LfkTemplateTitleSort) => void;
}) {
  const searchFieldId = useId();
  return (
    <div className="flex flex-col gap-2 border-b border-border/60 px-2 pb-2 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
      <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
        {templateCount === 0 ? "Нет шаблонов" : `Шаблонов: ${templateCount}`}
      </p>
      <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:max-w-full sm:flex-row sm:items-end sm:justify-end">
        <PickerSearchField
          id={searchFieldId}
          label="Поиск по названию"
          placeholder="Название шаблона"
          value={searchQuery}
          onValueChange={onSearchChange}
          className="min-w-0 sm:max-w-[14rem] sm:flex-initial"
        />
        <div className="flex min-w-[11rem] max-w-full flex-col gap-1 sm:max-w-[14rem] sm:flex-initial">
          <span className="text-[11px] text-muted-foreground sm:sr-only">Сортировка</span>
          <Select value={titleSort} onValueChange={(v) => onTitleSortChange(v as LfkTemplateTitleSort)}>
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
      </div>
    </div>
  );
}

export function LfkTemplatesPageClient({ templates, exerciseCatalog }: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [titleSort, setTitleSort] = useState<LfkTemplateTitleSort>("default");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileSheet, setMobileSheet] = useState<Template | null>(null);

  const displayList = useMemo(() => {
    let out = templates;
    const needle = normalizeRuSearchString(searchQuery.trim());
    if (needle) {
      out = out.filter((t) => normalizeRuSearchString(t.title).includes(needle));
    }
    if (titleSort === "asc" || titleSort === "desc") {
      out = [...out].sort((a, b) => {
        const cmp = a.title.localeCompare(b.title, "ru", { sensitivity: "base" });
        return titleSort === "asc" ? cmp : -cmp;
      });
    }
    return out;
  }, [templates, searchQuery, titleSort]);

  useEffect(() => {
    // Отложить setState из эффекта (eslint react-hooks/set-state-in-effect).
    queueMicrotask(() => {
      if (displayList.length === 0) {
        setSelectedId(null);
        setMobileSheet(null);
        return;
      }
      setSelectedId((cur) => {
        if (cur != null && displayList.some((t) => t.id === cur)) return cur;
        return displayList[0]!.id;
      });
      setMobileSheet((prev) => {
        if (prev == null) return prev;
        const next = displayList.find((t) => t.id === prev.id);
        return next ?? null;
      });
    });
  }, [displayList]);

  const selected =
    displayList.find((t) => t.id === selectedId) ?? (displayList.length > 0 ? displayList[0]! : null);

  const renderRows = (onPick: (t: Template) => void, activeId: string | null) =>
    displayList.length === 0 ? (
      <p className="px-2 pb-2 text-sm text-muted-foreground">Нет шаблонов по заданным условиям.</p>
    ) : (
      <ul className="flex max-h-[70vh] flex-col gap-1 overflow-auto lg:max-h-none lg:overflow-visible">
        {displayList.map((t) => {
          const active = activeId === t.id;
          const { published, label } = statusEyeMeta(t.status);
          const n = t.exerciseCount ?? t.exercises.length;
          const thumbs = (t.exerciseThumbnails ?? []).map(exerciseMediaToPreviewUi);
          return (
            <li key={t.id} className="rounded-md border border-border/40 bg-card/30">
              <div className="flex w-full items-stretch gap-0">
                <button
                  type="button"
                  onClick={() => onPick(t)}
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-2 rounded-md border border-transparent px-2 py-2 text-left text-sm hover:bg-muted/80",
                    active &&
                      "border-primary/25 bg-primary/15 text-primary hover:bg-primary/20 dark:bg-primary/20 dark:hover:bg-primary/25",
                  )}
                >
                  <div className="flex min-h-[30px] flex-wrap content-end items-end gap-1">
                    {thumbs.length === 0 ? (
                      <span
                        className={cn(
                          "self-center text-[11px] leading-none",
                          active ? "text-primary/75" : "text-muted-foreground",
                        )}
                      >
                        Нет превью
                      </span>
                    ) : (
                      thumbs.map((m, idx) => (
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
                      ))
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 font-medium leading-tight">{t.title}</div>
                    <div
                      className={cn(
                        "text-xs tabular-nums",
                        active ? "text-primary/70" : "text-muted-foreground",
                      )}
                    >
                      Упражнений: {n}
                    </div>
                  </div>
                </button>
                <span
                  className="inline-flex w-10 shrink-0 cursor-default items-center justify-center border-l border-border/40 bg-background/50"
                  role="img"
                  aria-label={label}
                  title={label}
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  {published ? (
                    <Eye className="size-4 text-green-600 dark:text-green-500" aria-hidden />
                  ) : (
                    <EyeOff className="size-4 text-muted-foreground" aria-hidden />
                  )}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="hidden lg:block">
        <div className={cn("grid items-stretch gap-4 lg:grid-cols-2", DOCTOR_DESKTOP_SPLIT_PANE_MAX_H_CLASS)}>
          <aside className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
            <div className="shrink-0 p-2 pb-0">
              <TemplateListToolbar
                templateCount={displayList.length}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                titleSort={titleSort}
                onTitleSortChange={setTitleSort}
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2 pt-2">
              {renderRows((t) => setSelectedId(t.id), selected?.id ?? null)}
            </div>
          </aside>

          <Card className="flex min-h-0 min-w-0 flex-col overflow-hidden">
            <CardContent className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
              {selected ? (
                <TemplateEditor template={selected} exerciseCatalog={exerciseCatalog} />
              ) : (
                <p className="text-sm text-muted-foreground">Выберите шаблон в списке.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="relative min-h-[40vh] overflow-hidden lg:hidden">
        <div
          className={cn(
            "transition-transform duration-300 ease-out",
            mobileSheet != null ? "-translate-x-full" : "translate-x-0",
          )}
        >
          <aside className="rounded-xl border border-border bg-card p-2">
            <TemplateListToolbar
              templateCount={displayList.length}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              titleSort={titleSort}
              onTitleSortChange={setTitleSort}
            />
            {renderRows((t) => {
              setSelectedId(t.id);
              setMobileSheet(t);
            }, mobileSheet?.id ?? null)}
          </aside>
        </div>

        <div
          className={cn(
            "absolute inset-0 z-10 overflow-y-auto bg-background px-1 pb-6 pt-2 transition-transform duration-300 ease-out",
            mobileSheet != null ? "translate-x-0" : "translate-x-full",
          )}
        >
          {mobileSheet != null ? (
            <>
              <Button variant="ghost" type="button" className="mb-2 h-9 px-2" onClick={() => setMobileSheet(null)}>
                ← Назад
              </Button>
              <Card className="min-w-0 border-0 shadow-none sm:border sm:shadow-sm">
                <CardContent className="p-2 sm:p-4">
                  <TemplateEditor template={mobileSheet} exerciseCatalog={exerciseCatalog} />
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
