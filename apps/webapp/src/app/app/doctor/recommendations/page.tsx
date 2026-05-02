import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import type { RecommendationUsageSnapshot } from "@/modules/recommendations/types";
import { parseRecommendationDomain } from "@/modules/recommendations/recommendationDomain";
import { AppShell } from "@/shared/ui/AppShell";
import { doctorCatalogViewFromSearchParams } from "@/shared/lib/doctorCatalogViewPreference";
import { RecommendationsPageClient, type RecommendationTitleSort } from "./RecommendationsPageClient";

type PageProps = {
  searchParams?: Promise<{
    selected?: string;
    view?: string;
    q?: string;
    titleSort?: string;
    region?: string;
    domain?: string;
  }>;
};

export default async function DoctorRecommendationsPage({ searchParams }: PageProps) {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();
  const sp = (await searchParams) ?? {};
  const q = typeof sp.q === "string" ? sp.q : "";
  const regionRefId = typeof sp.region === "string" && sp.region.trim() ? sp.region.trim() : undefined;
  const domain = parseRecommendationDomain(typeof sp.domain === "string" ? sp.domain : undefined);
  const titleSort: RecommendationTitleSort | null =
    sp.titleSort === "asc" || sp.titleSort === "desc" ? sp.titleSort : null;

  const items = await deps.recommendations.listRecommendations({
    search: q || null,
    archiveScope: "active",
    regionRefId: regionRefId ?? null,
    domain: domain ?? null,
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
        filters={{ q, regionRefId, domain }}
      />
    </AppShell>
  );
}
