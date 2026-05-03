import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { AppShell } from "@/shared/ui/AppShell";
import { doctorCatalogViewFromSearchParams } from "@/shared/lib/doctorCatalogViewPreference";
import {
  clinicalTestListArchiveScopeFromRecommendationFilter,
  parseRecommendationListFilterScope,
} from "@/shared/lib/doctorCatalogListStatus";
import { isClinicalAssessmentKind } from "@/modules/tests/clinicalTestAssessmentKind";
import { ClinicalTestsPageClient, type ClinicalTestTitleSort } from "./ClinicalTestsPageClient";

type PageProps = {
  searchParams?: Promise<{
    selected?: string;
    view?: string;
    q?: string;
    titleSort?: string;
    region?: string;
    assessment?: string;
    status?: string;
  }>;
};

export default async function DoctorClinicalTestsPage({ searchParams }: PageProps) {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();
  const sp = (await searchParams) ?? {};
  const q = typeof sp.q === "string" ? sp.q : "";
  const regionRefId = typeof sp.region === "string" && sp.region.trim() ? sp.region.trim() : undefined;
  const assessmentRaw = typeof sp.assessment === "string" ? sp.assessment.trim() : "";
  const assessmentKind = isClinicalAssessmentKind(assessmentRaw) ? assessmentRaw : undefined;
  const titleSort: ClinicalTestTitleSort | null =
    sp.titleSort === "asc" || sp.titleSort === "desc" ? sp.titleSort : null;

  const listStatus = parseRecommendationListFilterScope(sp, "active");
  const archiveScope = clinicalTestListArchiveScopeFromRecommendationFilter(listStatus);

  const items = await deps.clinicalTests.listClinicalTests({
    search: q || null,
    archiveScope,
    regionRefId: regionRefId ?? null,
    assessmentKind: assessmentKind ?? null,
  });

  const rawSelected = typeof sp.selected === "string" ? sp.selected.trim() : "";
  const initialSelectedId =
    rawSelected && items.some((t) => t.id === rawSelected) ? rawSelected : null;
  const initialSelectedUsageSnapshot =
    initialSelectedId != null ? await deps.clinicalTests.getClinicalTestUsage(initialSelectedId) : null;
  const { initialViewMode, viewLockedByUrl } = doctorCatalogViewFromSearchParams(
    typeof sp.view === "string" ? sp.view : undefined,
  );

  return (
    <AppShell title="Клинические тесты" user={session.user} variant="doctor" backHref="/app/doctor">
      <ClinicalTestsPageClient
        initialItems={items}
        initialSelectedId={initialSelectedId}
        initialSelectedUsageSnapshot={initialSelectedUsageSnapshot}
        initialViewMode={initialViewMode}
        viewLockedByUrl={viewLockedByUrl}
        initialTitleSort={titleSort}
        filters={{ q, regionRefId, assessmentKind, invalidAssessmentQuery: assessmentRaw !== "" && !assessmentKind, listStatus }}
      />
    </AppShell>
  );
}
