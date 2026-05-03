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
import { parseDoctorCatalogRegionQueryParam } from "@/shared/lib/doctorCatalogRegionQuery";
import { LfkTemplatesPageClient } from "./LfkTemplatesPageClient";

type PageProps = {
  searchParams?: Promise<{
    q?: string;
    region?: string;
    load?: string;
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
  const regionParsed = parseDoctorCatalogRegionQueryParam(sp.region);
  const loadType =
    sp.load === "strength" ||
    sp.load === "stretch" ||
    sp.load === "balance" ||
    sp.load === "cardio" ||
    sp.load === "other"
      ? (sp.load as ExerciseLoadType)
      : undefined;

  const initialTitleSort = sp.titleSort === "asc" || sp.titleSort === "desc" ? sp.titleSort : null;
  const listPubArch: DoctorCatalogPubArchQuery = parseDoctorCatalogPubArchQuery(sp);

  const deps = buildAppDeps();
  const [rawList, exercises, bodyRegionItems] = await Promise.all([
    deps.lfkTemplates.listTemplates({
      includeExerciseDetails: true,
      ...lfkTemplateFilterFromPubArch(listPubArch),
    }),
    deps.lfkExercises.listExercises({ includeArchived: false }),
    deps.references.listActiveItemsByCategoryCode("body_region"),
  ]);
  const bodyRegionIdToCode = Object.fromEntries(bodyRegionItems.map((it) => [it.id, it.code]));
  const exerciseMetaById: Record<string, { regionRefId: string | null; loadType: ExerciseLoadType | null }> = {};
  for (const e of exercises) {
    exerciseMetaById[e.id] = { regionRefId: e.regionRefId, loadType: e.loadType };
  }

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
          exerciseMetaById={exerciseMetaById}
          bodyRegionIdToCode={bodyRegionIdToCode}
          filters={{
            q,
            regionCode: regionParsed.regionCode,
            loadType,
            listPubArch,
          }}
          initialTitleSort={initialTitleSort}
        />
      </Suspense>
    </AppShell>
  );
}
