"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent } from "@/components/ui/card";
import type { Exercise, ExerciseLoadType } from "@/modules/lfk-exercises/types";
import { cn } from "@/lib/utils";
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
  loadLabels: Record<ExerciseLoadType, string>;
};

function mediaNode(exercise: Exercise) {
  const media = exercise.media[0];
  if (!media) return <div className="h-10 w-10 rounded bg-muted" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={media.mediaUrl} alt="" className="h-10 w-10 rounded object-cover" />;
}

export function ExercisesPageClient({ exercises, selectedExercise, viewMode, filters, loadLabels }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setQuery = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value == null || value === "") next.delete(key);
      else next.set(key, value);
    }
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="hidden items-end gap-3 lg:flex">
        <ExercisesFiltersForm
          q={filters.q}
          regionRefId={filters.regionRefId}
          loadType={filters.loadType}
          view={viewMode}
        />
        <div className="ml-auto flex items-center gap-2">
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
            onClick={() => setQuery({ view: "list" })}
            className={cn(
              buttonVariants({ variant: viewMode === "list" ? "default" : "outline" }),
              "h-9 px-3 text-sm",
            )}
          >
            Список
          </button>
          <Link href="/app/doctor/exercises/new" className={buttonVariants()} id="doctor-exercises-create-link-desktop">
            Создать упражнение
          </Link>
        </div>
      </div>

      <div className="hidden lg:block">
        {viewMode === "list" ? (
          <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
            <aside className="rounded-xl border border-border bg-card p-2">
              <p className="px-2 pb-2 text-xs text-muted-foreground">Список упражнений</p>
              {exercises.length === 0 ? (
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
              )}
            </aside>
            <Card className="min-w-0">
              <CardContent className="p-4">
                <ExerciseForm
                  exercise={selectedExercise}
                  saveAction={saveExerciseInline}
                  archiveAction={archiveExerciseInline}
                  backHref="/app/doctor/exercises?view=list"
                />
              </CardContent>
            </Card>
          </div>
        ) : exercises.length === 0 ? (
          <p className="text-muted-foreground">Нет упражнений по заданным фильтрам.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {exercises.map((ex) => (
              <li key={ex.id}>
                <ExerciseTileCard exercise={ex} loadLabels={loadLabels} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="lg:hidden">
        {exercises.length === 0 ? (
          <p className="text-muted-foreground">Нет упражнений по заданным фильтрам.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {exercises.map((ex) => (
              <li key={ex.id}>
                <ExerciseTileCard exercise={ex} loadLabels={loadLabels} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
