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
import {
  DOCTOR_CATALOG_STICKY_BAR_CLASS,
  DOCTOR_STICKY_PAGE_TOOLBAR_TOP_CLASS,
} from "@/shared/ui/doctorWorkspaceLayout";
import { CatalogLeftPane } from "@/shared/ui/CatalogLeftPane";
import { CatalogSplitLayout } from "@/shared/ui/CatalogSplitLayout";
import { DoctorCatalogPageLayout } from "@/shared/ui/DoctorCatalogPageLayout";
import { PickerSearchField } from "@/shared/ui/PickerSearchField";
import { MediaThumb } from "@/shared/ui/media/MediaThumb";
import { exerciseMediaToPreviewUi } from "@/shared/ui/media/mediaPreviewUiModel";
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

export function LfkTemplatesPageClient({ templates, exerciseCatalog }: Props) {
  const searchFieldId = useId();
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

  const desktopRight = (
    <Card className="flex min-h-0 min-w-0 flex-col overflow-hidden">
      <CardContent className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
        {selected ? (
          <TemplateEditor template={selected} exerciseCatalog={exerciseCatalog} />
        ) : (
          <p className="text-sm text-muted-foreground">Выберите шаблон в списке.</p>
        )}
      </CardContent>
    </Card>
  );

  const mobileDetailOpen = mobileSheet != null;

  const toolbar = (
    <div className={cn(DOCTOR_CATALOG_STICKY_BAR_CLASS, DOCTOR_STICKY_PAGE_TOOLBAR_TOP_CLASS)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-3">
        <p className="min-w-0 shrink-0 truncate text-xs text-muted-foreground">
          {displayList.length === 0 ? "Нет шаблонов" : `Шаблонов: ${displayList.length}`}
        </p>
        <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:max-w-full sm:flex-row sm:items-end sm:justify-end">
          <PickerSearchField
            id={searchFieldId}
            label="Поиск по названию"
            placeholder="Название шаблона"
            value={searchQuery}
            onValueChange={setSearchQuery}
            className="min-w-0 sm:max-w-[14rem] sm:flex-initial"
          />
          <div className="flex min-w-[11rem] max-w-full flex-col gap-1 sm:max-w-[14rem] sm:flex-initial">
            <span className="text-[11px] text-muted-foreground sm:sr-only">Сортировка</span>
            <Select value={titleSort} onValueChange={(v) => setTitleSort(v as LfkTemplateTitleSort)}>
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
    </div>
  );

  return (
    <DoctorCatalogPageLayout toolbar={toolbar}>
      <CatalogSplitLayout
        left={
          <CatalogLeftPane>
            {renderRows((t) => {
              setSelectedId(t.id);
              setMobileSheet(t);
            }, selected?.id ?? mobileSheet?.id ?? null)}
          </CatalogLeftPane>
        }
        right={desktopRight}
        mobileView={mobileDetailOpen ? "detail" : "list"}
        mobileBackSlot={
          mobileDetailOpen ? (
            <Button variant="ghost" type="button" className="mb-2 h-9 px-2" onClick={() => setMobileSheet(null)}>
              ← Назад
            </Button>
          ) : null
        }
      />
    </DoctorCatalogPageLayout>
  );
}
