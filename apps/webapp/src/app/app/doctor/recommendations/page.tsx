import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import type { RecommendationArchiveScope } from "@/modules/recommendations/types";
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
    scope?: string;
  }>;
};

export default async function DoctorRecommendationsPage({ searchParams }: PageProps) {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();
  const sp = (await searchParams) ?? {};
  const q = typeof sp.q === "string" ? sp.q : "";
  const titleSort: RecommendationTitleSort | null =
    sp.titleSort === "asc" || sp.titleSort === "desc" ? sp.titleSort : null;

  const scopeRaw = typeof sp.scope === "string" ? sp.scope.trim() : "";
  const archiveScope: RecommendationArchiveScope =
    scopeRaw === "all" || scopeRaw === "archived" ? scopeRaw : "active";

  const items = await deps.recommendations.listRecommendations({
    search: q || null,
    archiveScope,
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
        filters={{ q, archiveScope }}
      />
    </AppShell>
  );
}
