import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import { buildTreatmentProgramLibraryPickers } from "./buildTreatmentProgramLibraryPickers";
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

  const [items, exercises, lfkTemplates, testSets, clinicalTests, recommendations, contentPagesAll, bodyRegionItems] =
    await Promise.all([
      deps.treatmentProgram.listTemplates(tplListFilter),
      deps.lfkExercises.listExercises({ includeArchived: false }),
      deps.lfkTemplates.listTemplates({ statusIn: ["draft", "published"], includeExerciseDetails: true }),
      deps.testSets.listTestSets({ archiveScope: "active", publicationScope: "published" }),
      deps.clinicalTests.listClinicalTests({ archiveScope: "active" }),
      deps.recommendations.listRecommendations({ includeArchived: false }),
      deps.contentPages.listAll(),
      deps.references.listActiveItemsByCategoryCode("body_region"),
    ]);

  const bodyRegionIdToCode = Object.fromEntries(bodyRegionItems.map((it) => [it.id, it.code]));

  const library = buildTreatmentProgramLibraryPickers({
    exercises,
    lfkTemplates,
    testSets,
    clinicalTests,
    recommendations,
    contentPagesAll,
    bodyRegionIdToCode,
  });

  const raw = typeof sp.selected === "string" ? sp.selected.trim() : "";
  const initialSelectedId = raw && items.some((t) => t.id === raw) ? raw : null;
  const q = typeof sp.q === "string" ? sp.q : "";
  const initialTitleSort = sp.titleSort === "asc" || sp.titleSort === "desc" ? sp.titleSort : null;

  return (
    <DoctorAppShell title="Шаблоны программ" user={session.user} backHref="/app/doctor">
      <TreatmentProgramTemplatesPageClient
        templates={items}
        library={library}
        initialSelectedId={initialSelectedId}
        filters={{ q, listPubArch }}
        initialTitleSort={initialTitleSort}
      />
    </DoctorAppShell>
  );
}
