import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
import { doctorCatalogViewFromSearchParams } from "@/shared/lib/doctorCatalogViewPreference";
import {
  clinicalTestListArchiveScopeFromRecommendationFilter,
  parseRecommendationListFilterScope,
} from "@/shared/lib/doctorCatalogListStatus";
import { parseDoctorCatalogRegionQueryParam, resolveBodyRegionRefIdFromCatalogCode } from "@/shared/lib/doctorCatalogRegionQuery";
import {
  CLINICAL_ASSESSMENT_KIND_CATEGORY_CODE,
  assessmentKindWriteAllowSet,
  referenceItemsToAssessmentKindFilterDto,
} from "@/modules/tests/clinicalTestAssessmentKind";
import type { ClinicalTestTitleSort } from "./ClinicalTestsPageClient";

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
  const { buildAppDeps } = await import("@/app-layer/di/buildAppDeps");
  const deps = buildAppDeps();
  /** Параллельно с запросами данных подтягиваем клиентский чанк каталога. */
  const clinicalTestsClientPromise = import("./ClinicalTestsPageClient");
  const sp = (await searchParams) ?? {};
  const q = typeof sp.q === "string" ? sp.q : "";
  const regionParsed = parseDoctorCatalogRegionQueryParam(sp.region);
  const assessmentRaw = typeof sp.assessment === "string" ? sp.assessment.trim() : "";
  const [assessmentRefItems, bodyRegionItems] = await Promise.all([
    deps.references.listActiveItemsByCategoryCode(CLINICAL_ASSESSMENT_KIND_CATEGORY_CODE),
    deps.references.listActiveItemsByCategoryCode("body_region"),
  ]);
  const assessmentAllow = assessmentKindWriteAllowSet(assessmentRefItems);
  const assessmentKind = assessmentRaw && assessmentAllow.has(assessmentRaw) ? assessmentRaw : undefined;
  const titleSort: ClinicalTestTitleSort | null =
    sp.titleSort === "asc" || sp.titleSort === "desc" ? sp.titleSort : null;

  const listStatus = parseRecommendationListFilterScope(sp, "active");
  const archiveScope = clinicalTestListArchiveScopeFromRecommendationFilter(listStatus);

  const regionRefIdForList = resolveBodyRegionRefIdFromCatalogCode(
    bodyRegionItems,
    regionParsed.regionCode,
  );
  const items = await deps.clinicalTests.listClinicalTests({
    search: null,
    archiveScope,
    regionRefId: regionRefIdForList,
  });
  const bodyRegionIdToCode = Object.fromEntries(bodyRegionItems.map((it) => [it.id, it.code]));

  const rawSelected = typeof sp.selected === "string" ? sp.selected.trim() : "";
  const initialSelectedId =
    rawSelected && items.some((t) => t.id === rawSelected) ? rawSelected : null;
  const initialSelectedUsageSnapshot =
    initialSelectedId != null ? await deps.clinicalTests.getClinicalTestUsage(initialSelectedId) : null;
  const { initialViewMode, viewLockedByUrl } = doctorCatalogViewFromSearchParams(
    typeof sp.view === "string" ? sp.view : undefined,
  );

  const assessmentKindFilterItems = referenceItemsToAssessmentKindFilterDto(assessmentRefItems);

  const { ClinicalTestsPageClient } = await clinicalTestsClientPromise;

  return (
    <AppShell title="Клинические тесты" user={session.user} variant="doctor" backHref="/app/doctor">
      <ClinicalTestsPageClient
        initialItems={items}
        initialSelectedId={initialSelectedId}
        initialSelectedUsageSnapshot={initialSelectedUsageSnapshot}
        initialViewMode={initialViewMode}
        viewLockedByUrl={viewLockedByUrl}
        initialTitleSort={titleSort}
        assessmentKindFilterItems={assessmentKindFilterItems}
        assessmentKindCatalogItems={assessmentRefItems}
        bodyRegionIdToCode={bodyRegionIdToCode}
        filters={{
          q,
          regionCode: regionParsed.regionCode,
          assessmentKind,
          invalidAssessmentQuery: assessmentRaw !== "" && !assessmentKind,
          listStatus,
        }}
      />
    </AppShell>
  );
}
