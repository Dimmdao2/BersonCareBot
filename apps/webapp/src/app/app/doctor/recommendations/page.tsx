import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import {
  parseDoctorCatalogListStatus,
  recommendationArchiveScopeFromCatalogStatus,
} from "@/shared/lib/doctorCatalogListStatus";
import { AppShell } from "@/shared/ui/AppShell";
import {
  RecommendationsPageClient,
  type RecommendationsViewMode,
  type RecommendationTitleSort,
} from "./RecommendationsPageClient";

type PageProps = {
  searchParams?: Promise<{
    selected?: string;
    view?: string;
    q?: string;
    titleSort?: string;
    status?: string;
    scope?: string;
    region?: string;
    load?: string;
  }>;
};

export default async function DoctorRecommendationsPage({ searchParams }: PageProps) {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();
  const sp = (await searchParams) ?? {};
  const q = typeof sp.q === "string" ? sp.q : "";
  const regionRefId = typeof sp.region === "string" && sp.region.trim() ? sp.region.trim() : undefined;
  const loadType =
    sp.load === "strength" ||
    sp.load === "stretch" ||
    sp.load === "balance" ||
    sp.load === "cardio" ||
    sp.load === "other"
      ? sp.load
      : undefined;
  const titleSort: RecommendationTitleSort | null =
    sp.titleSort === "asc" || sp.titleSort === "desc" ? sp.titleSort : null;

  const catalogListStatus = parseDoctorCatalogListStatus(
    {
      status: typeof sp.status === "string" ? sp.status : undefined,
      scope: typeof sp.scope === "string" ? sp.scope : undefined,
    },
    "published",
  );
  const archiveScope = recommendationArchiveScopeFromCatalogStatus(catalogListStatus);

  const items = await deps.recommendations.listRecommendations({
    search: q || null,
    archiveScope,
    regionRefId: regionRefId ?? null,
    loadType: loadType ?? null,
  });

  const rawSelected = typeof sp.selected === "string" ? sp.selected.trim() : "";
  const initialSelectedId =
    rawSelected && items.some((r) => r.id === rawSelected) ? rawSelected : null;
  const initialViewMode: RecommendationsViewMode = sp.view === "list" ? "list" : "tiles";

  return (
    <AppShell title="Рекомендации" user={session.user} variant="doctor" backHref="/app/doctor">
      <RecommendationsPageClient
        initialItems={items}
        initialSelectedId={initialSelectedId}
        initialViewMode={initialViewMode}
        initialTitleSort={titleSort}
        filters={{ q, catalogListStatus, regionRefId, loadType }}
      />
    </AppShell>
  );
}
