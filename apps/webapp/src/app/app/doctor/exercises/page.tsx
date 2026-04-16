import Link from "next/link";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { AppShell } from "@/shared/ui/AppShell";
import { buttonVariants } from "@/components/ui/button-variants";
import type { ExerciseLoadType } from "@/modules/lfk-exercises/types";
import { cn } from "@/lib/utils";
import { ExercisesFiltersForm } from "./ExercisesFiltersForm";
import { ExercisesPageClient, type ExercisesViewMode } from "./ExercisesPageClient";

const LOAD_LABEL: Record<ExerciseLoadType, string> = {
  strength: "Силовая",
  stretch: "Растяжка",
  balance: "Баланс",
  cardio: "Кардио",
  other: "Другое",
};

type PageProps = {
  searchParams?: Promise<{ q?: string; region?: string; load?: string; view?: string; selected?: string }>;
};

export default async function DoctorExercisesPage({ searchParams }: PageProps) {
  const session = await requireDoctorAccess();
  const sp = (await searchParams) ?? {};
  const q = typeof sp.q === "string" ? sp.q : "";
  const regionRefId = typeof sp.region === "string" && sp.region.trim() ? sp.region.trim() : undefined;
  const loadType =
    sp.load === "strength" ||
    sp.load === "stretch" ||
    sp.load === "balance" ||
    sp.load === "cardio" ||
    sp.load === "other"
      ? sp.load
      : undefined;
  const viewMode: ExercisesViewMode = sp.view === "list" ? "list" : "tiles";
  const selectedExerciseId = typeof sp.selected === "string" && sp.selected.trim() ? sp.selected.trim() : null;

  const deps = buildAppDeps();
  const list = await deps.lfkExercises.listExercises({
    search: q || null,
    regionRefId: regionRefId ?? null,
    loadType: loadType ?? null,
    includeArchived: false,
  });
  const selectedExercise =
    viewMode === "list" && selectedExerciseId
      ? await deps.lfkExercises
          .getExercise(selectedExerciseId)
          .then((ex) => (ex && !ex.isArchived ? ex : null))
          .catch(() => null)
      : null;

  return (
    <AppShell title="Упражнения ЛФК" user={session.user} variant="doctor" backHref="/app/doctor">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3 lg:hidden">
          <ExercisesFiltersForm q={q} regionRefId={regionRefId} loadType={loadType} />
          <Link
            href="/app/doctor/exercises/new"
            className={cn(buttonVariants(), "ml-auto")}
            id="doctor-exercises-create-link"
          >
            Создать упражнение
          </Link>
        </div>

        <ExercisesPageClient
          exercises={list}
          selectedExercise={selectedExercise}
          viewMode={viewMode}
          filters={{
            q,
            regionRefId,
            loadType,
          }}
          loadLabels={LOAD_LABEL}
        />
      </div>
    </AppShell>
  );
}
