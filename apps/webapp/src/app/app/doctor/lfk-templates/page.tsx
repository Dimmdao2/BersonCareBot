import { Suspense } from "react";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import type { ExerciseLoadType } from "@/modules/lfk-exercises/types";
import { AppShell } from "@/shared/ui/AppShell";
import { LfkTemplatesPageClient } from "./LfkTemplatesPageClient";

type PageProps = {
  searchParams?: Promise<{
    q?: string;
    region?: string;
    load?: string;
    titleSort?: string;
  }>;
};

export default async function DoctorLfkTemplatesPage({ searchParams }: PageProps) {
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
      ? (sp.load as ExerciseLoadType)
      : undefined;

  const initialTitleSort = sp.titleSort === "asc" || sp.titleSort === "desc" ? sp.titleSort : null;

  const deps = buildAppDeps();
  const [list, exercises] = await Promise.all([
    deps.lfkTemplates.listTemplates({
      search: q || null,
      includeExerciseDetails: true,
    }),
    deps.lfkExercises.listExercises({ includeArchived: false }),
  ]);

  const exerciseCatalog = exercises.map((e) => ({
    id: e.id,
    title: e.title,
    firstMedia: e.media[0] ?? null,
  }));

  return (
    <AppShell title="Комплексы" user={session.user} variant="doctor" backHref="/app/doctor">
      <Suspense fallback={<p className="text-sm text-muted-foreground">Загрузка…</p>}>
        <LfkTemplatesPageClient
          templates={list}
          exerciseCatalog={exerciseCatalog}
          filters={{
            q,
            regionRefId,
            loadType,
          }}
          initialTitleSort={initialTitleSort}
        />
      </Suspense>
    </AppShell>
  );
}
