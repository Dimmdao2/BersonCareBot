"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LayoutGrid, List } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Exercise, ExerciseLoadType } from "@/modules/lfk-exercises/types";
import { cn } from "@/lib/utils";
import { MediaThumb } from "@/shared/ui/media/MediaThumb";
import { exerciseMediaToPreviewUi } from "@/shared/ui/media/mediaPreviewUiModel";
import { ExercisesFiltersForm } from "./ExercisesFiltersForm";
import { ExerciseForm } from "./ExerciseForm";
import { archiveExerciseInline, saveExerciseInline } from "./actionsInline";
import { ExerciseTileCard } from "./ExerciseTileCard";

export type ExercisesViewMode = "tiles" | "list";

type Props = {
  exercises: Exercise[];
  selectedExercise: Exercise | null;
  viewMode: ExercisesViewMode;
  filters: {
    q: string;
    regionRefId?: string;
    loadType?: ExerciseLoadType;
  };
};

const STICKY_UNDER_DOCTOR_HEADER_CLASS =
  "top-[calc(3.5rem+env(safe-area-inset-top,0px)+0.5rem)]";

function tileGridColsClass(count: number): string {
  if (count <= 0) return "grid-cols-1";
  if (count === 1) return "grid-cols-1";
  if (count === 2 || count === 4) return "grid-cols-2";
  return "grid-cols-3";
}

function mediaNode(exercise: Exercise) {
  const media = exercise.media[0];
  if (!media) return <div className="h-9 w-9 shrink-0 rounded bg-muted" />;
  return (
    <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded border border-border/40 bg-muted/30">
      <MediaThumb
        media={exerciseMediaToPreviewUi(media)}
        className="size-full"
        imgClassName="size-full object-cover"
        sizes="36px"
      />
    </div>
  );
}

type SelectionToolbarProps = {
  exerciseCount: number;
  createButtonId: string;
  onCreate: () => void;
  viewMode: ExercisesViewMode;
  onToggleView: () => void;
};

function SelectionToolbar({ exerciseCount, createButtonId, onCreate, viewMode, onToggleView }: SelectionToolbarProps) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border/60 px-2 pb-2">
      <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
        {exerciseCount === 0 ? "Нет упражнений" : `Упражнений: ${exerciseCount}`}
      </p>
      <div className="flex shrink-0 items-center gap-2">
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
  );
}

export function ExercisesPageClient({ exercises, selectedExercise, viewMode, filters }: Props) {
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
  const n = exercises.length;
  const tileCols = tileGridColsClass(n);

  const toggleViewMode = () => {
    const next: ExercisesViewMode = viewMode === "tiles" ? "list" : "tiles";
    setQuery({ view: next, selected: null });
  };

  const renderExerciseList = (opts: { activeId: string | null; onRowSelect: (id: string) => void }) =>
    exercises.length === 0 ? (
      <p className="px-2 pb-2 text-sm text-muted-foreground">Нет упражнений по заданным фильтрам.</p>
    ) : (
      <ul className="flex max-h-[70vh] flex-col gap-1 overflow-auto">
        {exercises.map((ex) => {
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

  const renderExerciseTiles = (opts: { onTileSelect: (id: string) => void }) =>
    exercises.length === 0 ? (
      <p className="px-2 text-sm text-muted-foreground">Нет упражнений по заданным фильтрам.</p>
    ) : (
      <ul className={cn("grid max-h-[70vh] gap-2 overflow-auto p-1", tileCols)}>
        {exercises.map((ex) => (
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
        <div className="grid gap-4 lg:grid-cols-2">
          <aside className="rounded-xl border border-border bg-card p-2">
            <SelectionToolbar
              exerciseCount={exercises.length}
              createButtonId="doctor-exercises-create-link-desktop"
              onCreate={() => setQuery({ selected: null })}
              viewMode={viewMode}
              onToggleView={toggleViewMode}
            />

            {viewMode === "list"
              ? renderExerciseList({
                  activeId: selectedExercise?.id ?? null,
                  onRowSelect: (id) => setQuery({ selected: id }),
                })
              : renderExerciseTiles({
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
                backHref={`/app/doctor/exercises?view=${viewMode}`}
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
              exerciseCount={exercises.length}
              createButtonId="doctor-exercises-create-link"
              onCreate={() => setMobileSheet({ exercise: null })}
              viewMode={viewMode}
              onToggleView={toggleViewMode}
            />
            {viewMode === "list" ? (
              renderExerciseList({
                activeId: mobileSheet?.exercise?.id ?? null,
                onRowSelect: (id) => {
                  const found = exercises.find((e) => e.id === id);
                  if (found) setMobileSheet({ exercise: found });
                },
              })
            ) : (
              <ul className={cn("grid gap-2 p-1", tileCols)}>
                {exercises.length === 0 ? (
                  <li className="col-span-full px-2 text-sm text-muted-foreground">
                    Нет упражнений по заданным фильтрам.
                  </li>
                ) : (
                  exercises.map((ex) => (
                    <li key={ex.id} className="w-full min-w-0">
                      <ExerciseTileCard
                        exercise={ex}
                        onSelect={(id) => {
                          const found = exercises.find((e) => e.id === id);
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
                    backHref="/app/doctor/exercises"
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
