import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import type { RecommendationUsageSnapshot } from "@/modules/recommendations/types";
import { parseRecommendationCatalogSsrQuery } from "@/modules/recommendations/recommendationCatalogSsrQuery";
import {
  RECOMMENDATION_TYPE_CATEGORY_CODE,
  referenceItemsToRecommendationDomainFilterDto,
} from "@/modules/recommendations/recommendationDomain";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import { doctorCatalogViewFromSearchParams } from "@/shared/lib/doctorCatalogViewPreference";
import {
  parseRecommendationListFilterScope,
  recommendationArchiveScopeFromListScope,
} from "@/shared/lib/doctorCatalogListStatus";
import { resolveBodyRegionRefIdFromCatalogCode } from "@/shared/lib/doctorCatalogRegionQuery";
import { doctorCatalogClientFilterUrlHints } from "@/shared/lib/doctorCatalogClientUrlSync";
import { RecommendationsPageClient, type RecommendationTitleSort } from "./RecommendationsPageClient";

type PageProps = {
  searchParams?: Promise<{
    selected?: string;
    view?: string;
    q?: string;
    titleSort?: string;
    region?: string;
    domain?: string;
    status?: string;
  }>;
};

export default async function DoctorRecommendationsPage({ searchParams }: PageProps) {
  const session = await requireDoctorAccess();
  const { buildAppDeps } = await import("@/app-layer/di/buildAppDeps");
  const deps = buildAppDeps();
  const sp = (await searchParams) ?? {};
  const q = typeof sp.q === "string" ? sp.q : "";
  const [recommendationTypeRefItems, bodyRegionItems] = await Promise.all([
    deps.references.listActiveItemsByCategoryCode(RECOMMENDATION_TYPE_CATEGORY_CODE),
    deps.references.listActiveItemsByCategoryCode("body_region"),
  ]);
  const domainFilterItems = referenceItemsToRecommendationDomainFilterDto(recommendationTypeRefItems);
  const catalogQuery = parseRecommendationCatalogSsrQuery(
    {
      region: typeof sp.region === "string" ? sp.region : undefined,
      domain: typeof sp.domain === "string" ? sp.domain : undefined,
    },
    recommendationTypeRefItems,
  );
  const titleSort: RecommendationTitleSort | null =
    sp.titleSort === "asc" || sp.titleSort === "desc" ? sp.titleSort : null;
  const listStatus = parseRecommendationListFilterScope(sp, "active");
  const archiveScope = recommendationArchiveScopeFromListScope(listStatus);

  const regionRefIdForList = resolveBodyRegionRefIdFromCatalogCode(
    bodyRegionItems,
    catalogQuery.regionCodeForCatalog,
  );
  const items = await deps.recommendations.listRecommendations({
    search: null,
    archiveScope,
    regionRefId: regionRefIdForList,
  });
  const bodyRegionIdToCode = Object.fromEntries(bodyRegionItems.map((it) => [it.id, it.code]));

  const rawSelected = typeof sp.selected === "string" ? sp.selected.trim() : "";
  const initialSelectedId =
    rawSelected && items.some((r) => r.id === rawSelected) ? rawSelected : null;
  let initialSelectedUsageSnapshot: RecommendationUsageSnapshot | null = null;
  if (initialSelectedId != null) {
    initialSelectedUsageSnapshot = await deps.recommendations.getRecommendationUsage(initialSelectedId);
  }
  const { initialViewMode, viewLockedByUrl } = doctorCatalogViewFromSearchParams(
    typeof sp.view === "string" ? sp.view : undefined,
  );

  return (
    <DoctorAppShell title="Рекомендации" user={session.user} backHref="/app/doctor">
      <RecommendationsPageClient
        initialItems={items}
        initialSelectedId={initialSelectedId}
        initialSelectedUsageSnapshot={initialSelectedUsageSnapshot}
        initialViewMode={initialViewMode}
        viewLockedByUrl={viewLockedByUrl}
        initialTitleSort={titleSort}
        domainFilterItems={domainFilterItems}
        domainCatalogItems={recommendationTypeRefItems}
        bodyRegionIdToCode={bodyRegionIdToCode}
        filters={{
          q,
          regionCode: catalogQuery.regionCodeForCatalog,
          listStatus,
          invalidDomainQuery: catalogQuery.invalidDomainQuery,
          domain: catalogQuery.domainCodeForCatalog,
          ...doctorCatalogClientFilterUrlHints(sp),
        }}
      />
    </DoctorAppShell>
  );
}
