import { Suspense } from "react";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import type { ExerciseLoadType } from "@/modules/lfk-exercises/types";
import { AppShell } from "@/shared/ui/AppShell";
import {
  lfkTemplateFilterFromPubArch,
  parseDoctorCatalogPubArchQuery,
  type DoctorCatalogPubArchQuery,
} from "@/shared/lib/doctorCatalogListStatus";
import { LfkTemplatesPageClient } from "./LfkTemplatesPageClient";

type PageProps = {
  searchParams?: Promise<{
    q?: string;
    regionRefId?: string;
    loadType?: string;
    titleSort?: string;
    status?: string;
    arch?: string;
    pub?: string;
  }>;
};

export default async function DoctorLfkTemplatesPage({ searchParams }: PageProps) {
  const session = await requireDoctorAccess();
  const sp = (await searchParams) ?? {};

  const q = typeof sp.q === "string" ? sp.q : "";
  const regionRefId = typeof sp.regionRefId === "string" && sp.regionRefId.trim() ? sp.regionRefId.trim() : undefined;
  const loadType =
    sp.loadType === "strength" ||
    sp.loadType === "stretch" ||
    sp.loadType === "balance" ||
    sp.loadType === "cardio" ||
    sp.loadType === "other"
      ? (sp.loadType as ExerciseLoadType)
      : undefined;

  const initialTitleSort = sp.titleSort === "asc" || sp.titleSort === "desc" ? sp.titleSort : null;
  const listPubArch: DoctorCatalogPubArchQuery = parseDoctorCatalogPubArchQuery(sp);

  const deps = buildAppDeps();
  const [rawList, exercises] = await Promise.all([
    deps.lfkTemplates.listTemplates({
      search: q || null,
      includeExerciseDetails: true,
      ...lfkTemplateFilterFromPubArch(listPubArch),
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
          templates={rawList}
          exerciseCatalog={exerciseCatalog}
          filters={{
            q,
            regionRefId,
            loadType,
            listPubArch,
          }}
          initialTitleSort={initialTitleSort}
        />
      </Suspense>
    </AppShell>
  );
}
