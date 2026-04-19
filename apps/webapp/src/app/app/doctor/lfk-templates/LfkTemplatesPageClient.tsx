"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { DoctorCatalogStickyToolbar } from "@/shared/ui/doctor/DoctorCatalogStickyToolbar";
import { DoctorCatalogTitleSortSelect, type TitleSortValue } from "@/shared/ui/doctor/DoctorCatalogTitleSortSelect";
import { DoctorCatalogToolbarMainRow } from "@/shared/ui/doctor/DoctorCatalogToolbarLayout";
import { CatalogLeftPane } from "@/shared/ui/CatalogLeftPane";
import { CatalogSplitLayout } from "@/shared/ui/CatalogSplitLayout";
import { DoctorCatalogPageLayout } from "@/shared/ui/DoctorCatalogPageLayout";
import { PickerSearchField } from "@/shared/ui/PickerSearchField";
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
          <section className="flex max-w-md flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
            <p className="text-sm text-muted-foreground">
              Задайте название черновика. После создания вы попадёте в конструктор, где можно добавить упражнения и
              опубликовать шаблон.
            </p>
            <form action={createLfkTemplateDraft} className="flex flex-col gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="lfk-tpl-new-title-inline">Название</Label>
                <Input id="lfk-tpl-new-title-inline" name="title" placeholder="Новый шаблон" />
              </div>
              <Button type="submit">Создать и открыть</Button>
            </form>
          </section>
        )}
      </CardContent>
    </Card>
  );

  const mobileDetailOpen = mobileSheet != null;

  const toolbar = (
    <DoctorCatalogStickyToolbar>
      <DoctorCatalogToolbarMainRow
        start={
          <>
            <div className="flex min-w-[11rem] max-w-full flex-col gap-1 sm:max-w-[14rem]">
              <span className="text-[11px] text-muted-foreground sm:sr-only">Статус</span>
              <Select value={statusSelectValue} onValueChange={applyStatusFilter}>
                <SelectTrigger size="sm" className="h-8 w-full text-left">
                  <SelectValue placeholder="Статус" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все</SelectItem>
                  <SelectItem value="draft">Черновики</SelectItem>
                  <SelectItem value="published">Опубликованные</SelectItem>
                  <SelectItem value="archived">Архив</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <PickerSearchField
              id={searchFieldId}
              label="Поиск по названию"
              placeholder="Название шаблона"
              value={searchQuery}
              onValueChange={setSearchQuery}
              className="min-w-0 sm:max-w-[14rem] sm:flex-initial"
            />
            <DoctorCatalogTitleSortSelect value={titleSort} onValueChange={setTitleSort} />
          </>
        }
        end={
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <p className="min-w-0 shrink-0 truncate text-xs text-muted-foreground">
              {displayList.length === 0 ? "Нет шаблонов" : `Шаблонов: ${displayList.length}`}
            </p>
            <Link
              href="/app/doctor/lfk-templates/new"
              className={cn(buttonVariants({ size: "sm" }), "shrink-0 text-center")}
              id="doctor-lfk-templates-new-link"
            >
              Новый шаблон
            </Link>
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
