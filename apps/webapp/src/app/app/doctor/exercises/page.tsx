import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { AppShell } from "@/shared/ui/AppShell";
import { doctorCatalogViewFromSearchParams } from "@/shared/lib/doctorCatalogViewPreference";
import { parseRecommendationListFilterScope } from "@/shared/lib/doctorCatalogListStatus";
import { parseDoctorCatalogRegionQueryParam } from "@/shared/lib/doctorCatalogRegionQuery";
import type { Exercise, ExerciseUsageSnapshot } from "@/modules/lfk-exercises/types";
import { ExercisesPageClient } from "./ExercisesPageClient";

type PageProps = {
  searchParams?: Promise<{
    q?: string;
    region?: string;
    load?: string;
    view?: string;
    selected?: string;
    titleSort?: string;
    status?: string;
  }>;
};

export default async function DoctorExercisesPage({ searchParams }: PageProps) {
  const session = await requireDoctorAccess();
  const sp = (await searchParams) ?? {};
  const q = typeof sp.q === "string" ? sp.q : "";
  const regionParsed = parseDoctorCatalogRegionQueryParam(sp.region);
  const loadType =
    sp.load === "strength" ||
    sp.load === "stretch" ||
    sp.load === "balance" ||
    sp.load === "cardio" ||
    sp.load === "other"
      ? sp.load
      : undefined;
  const { initialViewMode, viewLockedByUrl } = doctorCatalogViewFromSearchParams(
    typeof sp.view === "string" ? sp.view : undefined,
  );
  const selectedExerciseId = typeof sp.selected === "string" && sp.selected.trim() ? sp.selected.trim() : null;
  const titleSort = sp.titleSort === "asc" || sp.titleSort === "desc" ? sp.titleSort : null;
  const listStatus = parseRecommendationListFilterScope(sp, "active");

  type DoctorExerciseSelection = { exercise: Exercise | null; usage: ExerciseUsageSnapshot | null };

  const deps = buildAppDeps();
  const listPromise = deps.lfkExercises.listExercises({
    archiveListScope: listStatus,
  });
  const bodyRegionItems = await deps.references.listActiveItemsByCategoryCode("body_region");
  const bodyRegionIdToCode = Object.fromEntries(bodyRegionItems.map((it) => [it.id, it.code]));

  const doctorExerciseSelectionPromise: Promise<DoctorExerciseSelection> = selectedExerciseId
    ? deps.lfkExercises
        .getExercise(selectedExerciseId)
        .then(async (ex) => {
          if (!ex) return { exercise: null, usage: null };
          const usage = await deps.lfkExercises.getExerciseUsage(ex.id);
          return { exercise: ex, usage };
        })
        .catch(() => ({ exercise: null, usage: null }))
    : Promise.resolve({ exercise: null, usage: null });
  return (
    <AppShell title="Упражнения ЛФК" user={session.user} variant="doctor" backHref="/app/doctor">
      <ExercisesPageClient
        listPromise={listPromise}
        doctorExerciseSelectionPromise={doctorExerciseSelectionPromise}
        initialViewMode={initialViewMode}
        viewLockedByUrl={viewLockedByUrl}
        initialTitleSort={titleSort}
        bodyRegionIdToCode={bodyRegionIdToCode}
        filters={{
          q,
          regionCode: regionParsed.regionCode,
          loadType,
          listStatus,
        }}
      />
    </AppShell>
  );
}
