"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Exercise, ExerciseLoadType } from "@/modules/lfk-exercises/types";
import { cn } from "@/lib/utils";
import { VideoThumbnailPreview } from "@/shared/ui/media/VideoThumbnailPreview";
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

function mediaNode(exercise: Exercise) {
  const media = exercise.media[0];
  if (!media) return <div className="h-9 w-9 shrink-0 rounded bg-muted" />;
  if (media.mediaType === "video") {
    return (
      <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded border border-border/40 bg-muted/30">
        <VideoThumbnailPreview src={media.mediaUrl} className="h-full w-full object-cover" />
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={media.mediaUrl} alt="" className="h-9 w-9 shrink-0 rounded object-cover" />;
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

  return (
    <div className="flex flex-col gap-4">
      <div className="hidden flex-nowrap items-center gap-3 overflow-x-auto rounded-xl border border-border bg-card p-3 lg:flex">
        <ExercisesFiltersForm
          q={filters.q}
          regionRefId={filters.regionRefId}
          loadType={filters.loadType}
          view={viewMode}
        />
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setQuery({ view: "tiles", selected: null })}
            className={cn(
              buttonVariants({ variant: viewMode === "tiles" ? "default" : "outline" }),
              "h-9 px-3 text-sm",
            )}
          >
            Плитки
          </button>
          <button
            type="button"
            onClick={() => setQuery({ view: "list", selected: null })}
            className={cn(
              buttonVariants({ variant: viewMode === "list" ? "default" : "outline" }),
              "h-9 px-3 text-sm",
            )}
          >
            Список
          </button>
          <button
            type="button"
            id="doctor-exercises-create-link-desktop"
            className={buttonVariants()}
            onClick={() => setQuery({ selected: null })}
          >
            Создать упражнение
          </button>
        </div>
      </div>

      <div className="hidden lg:block">
        <div className="grid gap-4 lg:grid-cols-2">
          <aside className="rounded-xl border border-border bg-card p-2">
            <p className="px-2 pb-2 text-xs text-muted-foreground">
              {exercises.length === 0 ? "Нет упражнений" : `Упражнений: ${exercises.length}`}
            </p>

            {viewMode === "list" ? (
              exercises.length === 0 ? (
                <p className="px-2 pb-2 text-sm text-muted-foreground">Нет упражнений по заданным фильтрам.</p>
              ) : (
                <ul className="flex max-h-[70vh] flex-col gap-1 overflow-auto">
                  {exercises.map((ex) => {
                    const active = selectedExercise?.id === ex.id;
                    return (
                      <li key={ex.id}>
                        <button
                          type="button"
                          onClick={() => setQuery({ selected: ex.id })}
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
              )
            ) : exercises.length === 0 ? (
              <p className="px-2 text-sm text-muted-foreground">Нет упражнений по заданным фильтрам.</p>
            ) : (
              <ul className="grid max-h-[70vh] grid-cols-[repeat(auto-fill,minmax(180px,1fr))] justify-items-center gap-3 overflow-auto p-1">
                {exercises.map((ex) => (
                  <li key={ex.id} className="w-full max-w-[180px] justify-self-center">
                    <ExerciseTileCard
                      exercise={ex}
                      onSelect={(id) => setQuery({ view: "tiles", selected: id })}
                      isActive={selectedExercise?.id === ex.id}
                    />
                  </li>
                ))}
              </ul>
            )}
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
          <div className="mb-3 flex justify-end">
            <button
              type="button"
              id="doctor-exercises-create-link"
              className={buttonVariants()}
              onClick={() => setMobileSheet({ exercise: null })}
            >
              Создать упражнение
            </button>
          </div>
          {exercises.length === 0 ? (
            <p className="text-muted-foreground">Нет упражнений по заданным фильтрам.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-2">
              {exercises.map((ex) => (
                <li key={ex.id} className="flex justify-center">
                  <ExerciseTileCard
                    exercise={ex}
                    onSelect={(id) => {
                      const found = exercises.find((e) => e.id === id);
                      if (found) setMobileSheet({ exercise: found });
                    }}
                    isActive={mobileSheet?.exercise?.id === ex.id}
                  />
                </li>
              ))}
            </ul>
          )}
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
