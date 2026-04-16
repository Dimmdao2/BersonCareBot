"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LayoutGrid, List } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Exercise, ExerciseLoadType } from "@/modules/lfk-exercises/types";
import { cn } from "@/lib/utils";
import { ExerciseListCatalogThumb } from "@/shared/ui/media/ExerciseListCatalogThumb";
import { ExercisesFiltersForm } from "./ExercisesFiltersForm";
import { ExerciseForm } from "./ExerciseForm";
import { archiveExerciseInline, saveExerciseInline } from "./actionsInline";
import { ExerciseTileCard } from "./ExerciseTileCard";

export type ExercisesViewMode = "tiles" | "list";

export type ExerciseTitleSort = "asc" | "desc";

type Props = {
  exercises: Exercise[];
  selectedExercise: Exercise | null;
  viewMode: ExercisesViewMode;
  titleSort: ExerciseTitleSort | null;
  filters: {
    q: string;
    regionRefId?: string;
    loadType?: ExerciseLoadType;
  };
};

function exercisesIndexHref(view: ExercisesViewMode, titleSort: ExerciseTitleSort | null): string {
  const p = new URLSearchParams();
  p.set("view", view);
  if (titleSort) p.set("titleSort", titleSort);
  return `/app/doctor/exercises?${p.toString()}`;
}

const STICKY_UNDER_DOCTOR_HEADER_CLASS =
  "top-[calc(3.5rem+env(safe-area-inset-top,0px)+0.5rem)]";

function tileGridColsClass(count: number): string {
  if (count <= 0) return "grid-cols-1";
  if (count === 1) return "grid-cols-1";
  if (count === 2 || count === 4) return "grid-cols-2";
  return "grid-cols-3";
}

function mediaNode(exercise: Exercise) {
  return <ExerciseListCatalogThumb media={exercise.media[0]} />;
}

type SelectionToolbarProps = {
  exerciseCount: number;
  createButtonId: string;
  onCreate: () => void;
  viewMode: ExercisesViewMode;
  onToggleView: () => void;
  titleSort: ExerciseTitleSort | null;
  onTitleSortChange: (next: ExerciseTitleSort | null) => void;
};

function SelectionToolbar({
  exerciseCount,
  createButtonId,
  onCreate,
  viewMode,
  onToggleView,
  titleSort,
  onTitleSortChange,
}: SelectionToolbarProps) {
  return (
    <div className="flex flex-col gap-2 border-b border-border/60 px-2 pb-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
        {exerciseCount === 0 ? "Нет упражнений" : `Упражнений: ${exerciseCount}`}
      </p>
      <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
        <div className="flex min-w-[11rem] max-w-full flex-1 flex-col gap-1 sm:max-w-[14rem] sm:flex-initial">
          <span className="text-[11px] text-muted-foreground sm:sr-only">Сортировка</span>
          <Select
            value={titleSort ?? "default"}
            onValueChange={(v) => {
              if (v === "default") onTitleSortChange(null);
              else onTitleSortChange(v as ExerciseTitleSort);
            }}
          >
            <SelectTrigger size="sm" className="h-8 w-full text-left">
              <SelectValue placeholder="Сортировка" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">По дате изменения</SelectItem>
              <SelectItem value="asc">Название А→Я</SelectItem>
              <SelectItem value="desc">Название Я→А</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2">
          <button type="button" id={createButtonId} className={buttonVariants({ size: "sm" })} onClick={onCreate}>
            Создать упражнение
          </button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0"
            aria-label={viewMode === "tiles" ? "Показать список" : "Показать плитки"}
            title={viewMode === "tiles" ? "Список" : "Плитки"}
            onClick={onToggleView}
          >
            {viewMode === "tiles" ? <List className="size-4" aria-hidden /> : <LayoutGrid className="size-4" aria-hidden />}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ExercisesPageClient({ exercises, selectedExercise, viewMode, titleSort, filters }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mobileSheet, setMobileSheet] = useState<{ exercise: Exercise | null } | null>(null);

  const setQuery = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value == null || value === "") next.delete(key);
      else next.set(key, value);
    }
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  };

  const formKey = selectedExercise?.id ?? "create";

  const displayExercises = useMemo(() => {
    if (!titleSort) return exercises;
    return [...exercises].sort((a, b) => {
      const cmp = a.title.localeCompare(b.title, "ru", { sensitivity: "base" });
      return titleSort === "asc" ? cmp : -cmp;
    });
  }, [exercises, titleSort]);

  const n = displayExercises.length;
  const tileCols = tileGridColsClass(n);
  const listBackHref = exercisesIndexHref(viewMode, titleSort);

  const toggleViewMode = () => {
    const next: ExercisesViewMode = viewMode === "tiles" ? "list" : "tiles";
    setQuery({ view: next, selected: null });
  };

  const renderExerciseList = (
    list: Exercise[],
    opts: { activeId: string | null; onRowSelect: (id: string) => void },
  ) =>
    list.length === 0 ? (
      <p className="px-2 pb-2 text-sm text-muted-foreground">Нет упражнений по заданным фильтрам.</p>
    ) : (
      <ul className="flex max-h-[70vh] flex-col gap-1 overflow-auto">
        {list.map((ex) => {
          const active = opts.activeId === ex.id;
          return (
            <li key={ex.id}>
              <button
                type="button"
                onClick={() => opts.onRowSelect(ex.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted",
                  active && "bg-primary text-primary-foreground hover:bg-primary/90",
                )}
              >
                {mediaNode(ex)}
                <span className="line-clamp-2">{ex.title}</span>
              </button>
            </li>
          );
        })}
      </ul>
    );

  const renderExerciseTiles = (list: Exercise[], opts: { onTileSelect: (id: string) => void }) =>
    list.length === 0 ? (
      <p className="px-2 text-sm text-muted-foreground">Нет упражнений по заданным фильтрам.</p>
    ) : (
      <ul className={cn("grid max-h-[70vh] gap-2 overflow-auto p-1", tileCols)}>
        {list.map((ex) => (
          <li key={ex.id} className="w-full min-w-0">
            <ExerciseTileCard
              exercise={ex}
              onSelect={(id) => opts.onTileSelect(id)}
              isActive={selectedExercise?.id === ex.id}
            />
          </li>
        ))}
      </ul>
    );

  return (
    <div className="flex flex-col gap-4">
      <div
        className={cn(
          "sticky z-20 -mx-4 border-b border-border/60 bg-background/95 px-4 py-2 backdrop-blur-md supports-backdrop-filter:bg-background/90 md:-mx-6 md:px-6",
          STICKY_UNDER_DOCTOR_HEADER_CLASS,
        )}
      >
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0 flex-1">
              <ExercisesFiltersForm
                q={filters.q}
                regionRefId={filters.regionRefId}
                loadType={filters.loadType}
                view={viewMode}
                titleSort={titleSort}
              />
            </div>
            <Link
              href="/app/doctor/exercises/auto-create"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shrink-0 self-end sm:self-start")}
            >
              Автосоздание
            </Link>
          </div>
        </div>
      </div>

      <div className="hidden lg:block">
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <aside className="rounded-xl border border-border bg-card p-2">
            <SelectionToolbar
              exerciseCount={displayExercises.length}
              createButtonId="doctor-exercises-create-link-desktop"
              onCreate={() => setQuery({ selected: null })}
              viewMode={viewMode}
              onToggleView={toggleViewMode}
              titleSort={titleSort}
              onTitleSortChange={(next) => setQuery({ titleSort: next })}
            />

            {viewMode === "list"
              ? renderExerciseList(displayExercises, {
                  activeId: selectedExercise?.id ?? null,
                  onRowSelect: (id) => setQuery({ selected: id }),
                })
              : renderExerciseTiles(displayExercises, {
                  onTileSelect: (id) => setQuery({ view: "tiles", selected: id }),
                })}
          </aside>

          <Card key={formKey} className="min-w-0">
            <CardContent className="p-4">
              <ExerciseForm
                key={formKey}
                exercise={selectedExercise}
                saveAction={saveExerciseInline}
                archiveAction={archiveExerciseInline}
                backHref={listBackHref}
                viewHint={viewMode}
              />
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
            <SelectionToolbar
              exerciseCount={displayExercises.length}
              createButtonId="doctor-exercises-create-link"
              onCreate={() => setMobileSheet({ exercise: null })}
              viewMode={viewMode}
              onToggleView={toggleViewMode}
              titleSort={titleSort}
              onTitleSortChange={(next) => setQuery({ titleSort: next })}
            />
            {viewMode === "list" ? (
              renderExerciseList(displayExercises, {
                activeId: mobileSheet?.exercise?.id ?? null,
                onRowSelect: (id) => {
                  const found = displayExercises.find((e) => e.id === id);
                  if (found) setMobileSheet({ exercise: found });
                },
              })
            ) : (
              <ul className={cn("grid gap-2 p-1", tileCols)}>
                {displayExercises.length === 0 ? (
                  <li className="col-span-full px-2 text-sm text-muted-foreground">
                    Нет упражнений по заданным фильтрам.
                  </li>
                ) : (
                  displayExercises.map((ex) => (
                    <li key={ex.id} className="w-full min-w-0">
                      <ExerciseTileCard
                        exercise={ex}
                        onSelect={(id) => {
                          const found = displayExercises.find((e) => e.id === id);
                          if (found) setMobileSheet({ exercise: found });
                        }}
                        isActive={mobileSheet?.exercise?.id === ex.id}
                      />
                    </li>
                  ))
                )}
              </ul>
            )}
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
                  <ExerciseForm
                    key={mobileSheet.exercise?.id ?? "create"}
                    exercise={mobileSheet.exercise}
                    saveAction={saveExerciseInline}
                    archiveAction={archiveExerciseInline}
                    backHref={listBackHref}
                    viewHint={viewMode}
                  />
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
