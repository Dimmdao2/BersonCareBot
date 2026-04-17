import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { AppShell } from "@/shared/ui/AppShell";
import { ExercisesPageClient, type ExercisesViewMode } from "./ExercisesPageClient";

type PageProps = {
  searchParams?: Promise<{
    q?: string;
    region?: string;
    load?: string;
    view?: string;
    selected?: string;
    titleSort?: string;
  }>;
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
  const titleSort = sp.titleSort === "asc" || sp.titleSort === "desc" ? sp.titleSort : null;

  const deps = buildAppDeps();
  const listPromise = deps.lfkExercises.listExercises({
    search: q || null,
    regionRefId: regionRefId ?? null,
    loadType: loadType ?? null,
    includeArchived: false,
  });
  const selectedExercisePromise = selectedExerciseId
    ? deps.lfkExercises
        .getExercise(selectedExerciseId)
        .then((ex) => (ex && !ex.isArchived ? ex : null))
        .catch(() => null)
    : Promise.resolve(null);
  return (
    <AppShell title="Упражнения ЛФК" user={session.user} variant="doctor" backHref="/app/doctor">
      <div className="flex flex-col gap-4">
        <ExercisesPageClient
          listPromise={listPromise}
          selectedExercisePromise={selectedExercisePromise}
          initialViewMode={viewMode}
          initialTitleSort={titleSort}
          filters={{
            q,
            regionRefId,
            loadType,
          }}
        />
      </div>
    </AppShell>
  );
}
