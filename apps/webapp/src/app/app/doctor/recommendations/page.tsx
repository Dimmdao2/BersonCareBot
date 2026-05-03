import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import type { RecommendationUsageSnapshot } from "@/modules/recommendations/types";
import { parseRecommendationCatalogSsrQuery } from "@/modules/recommendations/recommendationCatalogSsrQuery";
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
    region?: string;
    domain?: string;
    status?: string;
  }>;
};

export default async function DoctorRecommendationsPage({ searchParams }: PageProps) {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();
  const sp = (await searchParams) ?? {};
  const q = typeof sp.q === "string" ? sp.q : "";
  const catalogQuery = parseRecommendationCatalogSsrQuery({
    region: typeof sp.region === "string" ? sp.region : undefined,
    domain: typeof sp.domain === "string" ? sp.domain : undefined,
  });
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
