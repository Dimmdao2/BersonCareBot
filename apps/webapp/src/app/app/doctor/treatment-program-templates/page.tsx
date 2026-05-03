import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import type { ExerciseLoadType } from "@/modules/lfk-exercises/types";
import { AppShell } from "@/shared/ui/AppShell";
import {
  LESSON_CONTENT_SECTION,
  LESSON_CONTENT_SECTION_LEGACY,
} from "@/modules/treatment-program/types";
import type { TreatmentProgramLibraryPickers } from "./[id]/TreatmentProgramConstructorClient";
import { TreatmentProgramTemplatesPageClient } from "./TreatmentProgramTemplatesPageClient";
import {
  parseDoctorCatalogPubArchQuery,
  treatmentProgramTemplateFilterFromPubArch,
} from "@/shared/lib/doctorCatalogListStatus";

type PageProps = {
  searchParams?: Promise<{
    selected?: string;
    q?: string;
    titleSort?: string;
    region?: string;
    load?: string;
    status?: string;
    arch?: string;
    pub?: string;
  }>;
};

export default async function TreatmentProgramTemplatesPage({ searchParams }: PageProps) {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();

  const sp = (await searchParams) ?? {};
  const listPubArch = parseDoctorCatalogPubArchQuery(sp);
  const tplListFilter = treatmentProgramTemplateFilterFromPubArch(listPubArch);

  const [items, exercises, lfkTemplates, testSets, recommendations, contentPagesAll] = await Promise.all([
    deps.treatmentProgram.listTemplates(tplListFilter),
    deps.lfkExercises.listExercises({ includeArchived: false }),
    deps.lfkTemplates.listTemplates({}),
    deps.testSets.listTestSets({ includeArchived: false }),
    deps.recommendations.listRecommendations({ includeArchived: false }),
    deps.contentPages.listAll(),
  ]);

  const library: TreatmentProgramLibraryPickers = {
    exercises: exercises.map((e) => ({ id: e.id, title: e.title })),
    lfkComplexes: lfkTemplates
      .filter((t) => t.status !== "archived")
      .map((t) => ({ id: t.id, title: t.title })),
    testSets: testSets.map((t) => ({ id: t.id, title: t.title })),
    recommendations: recommendations.map((r) => ({ id: r.id, title: r.title })),
    lessons: contentPagesAll
      .filter(
        (p) =>
          (p.section === LESSON_CONTENT_SECTION || p.section === LESSON_CONTENT_SECTION_LEGACY) &&
          !p.deletedAt,
      )
      .map((p) => ({ id: p.id, title: p.title })),
  };

  const raw = typeof sp.selected === "string" ? sp.selected.trim() : "";
  const initialSelectedId = raw && items.some((t) => t.id === raw) ? raw : null;
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

  return (
    <AppShell title="Шаблоны программ" user={session.user} variant="doctor" backHref="/app/doctor">
      <TreatmentProgramTemplatesPageClient
        templates={items}
        library={library}
        initialSelectedId={initialSelectedId}
        filters={{ q, regionRefId, loadType, listPubArch }}
        initialTitleSort={initialTitleSort}
      />
    </AppShell>
  );
}
