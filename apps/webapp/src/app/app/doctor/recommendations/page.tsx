import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import type { RecommendationUsageSnapshot } from "@/modules/recommendations/types";
import { parseRecommendationCatalogSsrQuery } from "@/modules/recommendations/recommendationCatalogSsrQuery";
import {
  RECOMMENDATION_TYPE_CATEGORY_CODE,
  referenceItemsToRecommendationDomainFilterDto,
} from "@/modules/recommendations/recommendationDomain";
import { AppShell } from "@/shared/ui/AppShell";
import { doctorCatalogViewFromSearchParams } from "@/shared/lib/doctorCatalogViewPreference";
import {
  parseRecommendationListFilterScope,
  recommendationArchiveScopeFromListScope,
} from "@/shared/lib/doctorCatalogListStatus";
import { RecommendationsPageClient, type RecommendationTitleSort } from "./RecommendationsPageClient";

type PageProps = {
  searchParams?: Promise<{
    selected?: string;
    view?: string;
    q?: string;
    titleSort?: string;
    /** Паритет с `GET /api/doctor/recommendations?region=`; в UI каталога также поддерживается legacy `regionRefId`. */
    region?: string;
    regionRefId?: string;
    domain?: string;
    status?: string;
  }>;
};

export default async function DoctorRecommendationsPage({ searchParams }: PageProps) {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();
  const sp = (await searchParams) ?? {};
  const q = typeof sp.q === "string" ? sp.q : "";
  const recommendationTypeRefItems = await deps.references.listActiveItemsByCategoryCode(
    RECOMMENDATION_TYPE_CATEGORY_CODE,
  );
  const domainFilterItems = referenceItemsToRecommendationDomainFilterDto(recommendationTypeRefItems);
  const regionQs =
    typeof sp.region === "string" && sp.region.trim()
      ? sp.region
      : typeof sp.regionRefId === "string" && sp.regionRefId.trim()
        ? sp.regionRefId
        : undefined;
  const catalogQuery = parseRecommendationCatalogSsrQuery(
    {
      region: regionQs,
      domain: typeof sp.domain === "string" ? sp.domain : undefined,
    },
    recommendationTypeRefItems,
  );
  const titleSort: RecommendationTitleSort | null =
    sp.titleSort === "asc" || sp.titleSort === "desc" ? sp.titleSort : null;
  const listStatus = parseRecommendationListFilterScope(sp, "active");
  const archiveScope = recommendationArchiveScopeFromListScope(listStatus);

  const items = await deps.recommendations.listRecommendations({
    search: q || null,
    archiveScope,
    regionRefId: catalogQuery.regionRefIdForList,
    domain: catalogQuery.domainForList,
  });

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
    <AppShell title="Рекомендации" user={session.user} variant="doctor" backHref="/app/doctor">
      <RecommendationsPageClient
        initialItems={items}
        initialSelectedId={initialSelectedId}
        initialSelectedUsageSnapshot={initialSelectedUsageSnapshot}
        initialViewMode={initialViewMode}
        viewLockedByUrl={viewLockedByUrl}
        initialTitleSort={titleSort}
        domainFilterItems={domainFilterItems}
        domainCatalogItems={recommendationTypeRefItems}
        filters={{
          q,
          regionRefId: catalogQuery.regionRefIdForList ?? undefined,
          domain: catalogQuery.domainForList ?? undefined,
          listStatus,
          invalidDomainQuery: catalogQuery.invalidDomainQuery,
          invalidRegionQuery: catalogQuery.invalidRegionQuery,
        }}
      />
    </AppShell>
  );
}
