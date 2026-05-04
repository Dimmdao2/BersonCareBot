import { Suspense } from "react";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import type { ExerciseLoadType } from "@/modules/lfk-exercises/types";
import {
  EXERCISE_LOAD_TYPE_CATEGORY_CODE,
  exerciseLoadTypeWriteAllowSet,
  parseExerciseLoadQueryParam,
} from "@/modules/lfk-exercises/exerciseLoadTypeReference";
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

  const initialTitleSort = sp.titleSort === "asc" || sp.titleSort === "desc" ? sp.titleSort : null;
  const listPubArch: DoctorCatalogPubArchQuery = parseDoctorCatalogPubArchQuery(sp);

  const deps = buildAppDeps();
  const [rawList, exercises, bodyRegionItems, loadTypeRefItems] = await Promise.all([
    deps.lfkTemplates.listTemplates({
      includeExerciseDetails: true,
      ...lfkTemplateFilterFromPubArch(listPubArch),
    }),
    deps.lfkExercises.listExercises({ includeArchived: false }),
    deps.references.listActiveItemsByCategoryCode("body_region"),
    deps.references.listActiveItemsByCategoryCode(EXERCISE_LOAD_TYPE_CATEGORY_CODE),
  ]);
  const loadAllow = exerciseLoadTypeWriteAllowSet(loadTypeRefItems);
  const loadType = parseExerciseLoadQueryParam(typeof sp.load === "string" ? sp.load : undefined, loadAllow);
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
