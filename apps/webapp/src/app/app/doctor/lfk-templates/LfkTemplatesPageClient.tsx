"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { useDoctorCatalogDisplayList } from "@/shared/hooks/useDoctorCatalogDisplayList";
import { useDoctorCatalogMasterSelectionSync } from "@/shared/hooks/useDoctorCatalogMasterSelectionSync";
import type { CatalogMasterTitleSort } from "@/shared/ui/doctor/DoctorCatalogMasterListHeader";
import { DoctorCatalogListSortHeader } from "@/shared/ui/doctor/DoctorCatalogListSortHeader";
import type { TitleSortValue } from "@/shared/ui/doctor/DoctorCatalogTitleSortSelect";
import { CatalogLeftPane } from "@/shared/ui/CatalogLeftPane";
import { CatalogRightPane } from "@/shared/ui/CatalogRightPane";
import { CatalogSplitLayout } from "@/shared/ui/CatalogSplitLayout";
import { DoctorCatalogPageLayout } from "@/shared/ui/DoctorCatalogPageLayout";
import { Input } from "@/components/ui/input";
import {
  DOCTOR_CATALOG_STICKY_BAR_CLASS,
  DOCTOR_STICKY_PAGE_TOOLBAR_TOP_CLASS,
} from "@/shared/ui/doctorWorkspaceLayout";
import { MediaThumb } from "@/shared/ui/media/MediaThumb";
import { exerciseMediaToPreviewUi } from "@/shared/ui/media/mediaPreviewUiModel";
import { createLfkTemplateDraft } from "./actions";
import { TemplateEditor } from "./TemplateEditor";

type Props = {
  templates: Template[];
  exerciseCatalog: Array<{ id: string; title: string; firstMedia: ExerciseMedia | null }>;
  /** Соответствует `?status=` в URL; пусто — «все». */
  initialStatusFilter: "" | TemplateStatus;
};

const STATUS_FILTER_LABELS: Record<string, string> = {
  all: "Все",
  draft: "Черновики",
  published: "Опубликованные",
  archived: "Архив",
};

function statusEyeMeta(status: TemplateStatus) {
  const published = status === "published";
  const archived = status === "archived";
  const label = archived ? "В архиве" : published ? "Опубликован" : "Черновик";
  return { published, label };
}

export function LfkTemplatesPageClient({ templates, exerciseCatalog, initialStatusFilter }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchFieldId = useId();
  const [searchQuery, setSearchQuery] = useState("");
  const [titleSort, setTitleSort] = useState<TitleSortValue>("default");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileSheet, setMobileSheet] = useState<Template | null>(null);

  const statusSelectValue = initialStatusFilter === "" ? "all" : initialStatusFilter;

  function applyStatusFilter(next: string | null) {
    const p = new URLSearchParams(searchParams.toString());
    if (next == null || next === "" || next === "all") {
      p.delete("status");
    } else {
      p.set("status", next);
    }
    const qs = p.toString();
    router.replace(qs ? `/app/doctor/lfk-templates?${qs}` : "/app/doctor/lfk-templates");
  }

  const displayList = useDoctorCatalogDisplayList(templates, searchQuery, titleSort);

  useDoctorCatalogMasterSelectionSync({
    displayList,
    setSelectedId,
    setMobileItem: setMobileSheet,
    fallbackToFirst: false,
  });

  const selected = displayList.find((t) => t.id === selectedId) ?? null;

  const titleSortForHeader: CatalogMasterTitleSort | null =
    titleSort === "asc" || titleSort === "desc" ? titleSort : null;

  const renderRows = (onPick: (t: Template) => void, activeId: string | null) =>
    displayList.length === 0 ? (
      <p className="text-sm text-muted-foreground">Нет комплексов по заданным условиям.</p>
    ) : (
      <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
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
    <CatalogRightPane className="h-full">
      {selected ? (
        <TemplateEditor key={selected.id} template={selected} exerciseCatalog={exerciseCatalog} />
      ) : (
        <section className="flex max-w-md flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">
            Задайте название черновика. После создания вы попадёте в конструктор, где можно добавить упражнения и
            опубликовать комплекс.
          </p>
          <form action={createLfkTemplateDraft} className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <label htmlFor="lfk-tpl-new-title-inline" className="text-sm font-medium">
                Название
              </label>
              <Input id="lfk-tpl-new-title-inline" name="title" placeholder="Новый комплекс" />
            </div>
            <Button type="submit">Создать и открыть</Button>
          </form>
        </section>
      )}
    </CatalogRightPane>
  );

  const mobileDetailOpen = mobileSheet != null;

  const toolbar = (
    <div className={cn(DOCTOR_CATALOG_STICKY_BAR_CLASS, DOCTOR_STICKY_PAGE_TOOLBAR_TOP_CLASS)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <div className="flex min-w-[11rem] max-w-full flex-col gap-1 sm:max-w-[14rem]">
            <span className="text-[11px] text-muted-foreground sm:sr-only">Статус</span>
            <Select value={statusSelectValue} onValueChange={applyStatusFilter}>
              <SelectTrigger size="sm" className="w-full max-w-full text-left">
                <SelectValue placeholder="Все">
                  {(val: unknown) => {
                    const key = val == null || val === "" ? "all" : String(val);
                    return STATUS_FILTER_LABELS[key] ?? STATUS_FILTER_LABELS.all;
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все</SelectItem>
                <SelectItem value="draft">Черновики</SelectItem>
                <SelectItem value="published">Опубликованные</SelectItem>
                <SelectItem value="archived">Архив</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex min-w-0 flex-col gap-1 sm:max-w-[14rem]">
            <label htmlFor={searchFieldId} className="sr-only">
              Поиск по названию
            </label>
            <Input
              id={searchFieldId}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Название комплекса"
              autoComplete="off"
              className="w-full min-w-0 sm:w-40"
            />
          </div>
        </div>
        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
          <Link
            href="/app/doctor/lfk-templates/new"
            className={cn(buttonVariants({ size: "sm" }), "shrink-0 text-center")}
            id="doctor-lfk-templates-new-link"
          >
            Новый комплекс
          </Link>
        </div>
      </div>
    </div>
  );

  return (
    <DoctorCatalogPageLayout toolbar={toolbar}>
      <CatalogSplitLayout
        className="lg:h-[calc(100dvh-3.5rem-env(safe-area-inset-top,0px)-3.25rem-1rem)] lg:overflow-hidden"
        left={
          <CatalogLeftPane
            stickySplit={false}
            stickyToolbarRows={1}
            className="h-full"
            headerSlot={
              <DoctorCatalogListSortHeader
                summaryLine={
                  displayList.length === 0 ? "Нет комплексов" : `Комплексов: ${displayList.length}`
                }
                titleSort={titleSortForHeader}
                onTitleSortChange={(next) => setTitleSort(next === null ? "default" : next)}
              />
            }
          >
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
