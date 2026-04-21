import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { AppShell } from "@/shared/ui/AppShell";
import {
  ClinicalTestsPageClient,
  type ClinicalTestsViewMode,
  type ClinicalTestTitleSort,
} from "./ClinicalTestsPageClient";

type PageProps = {
  searchParams?: Promise<{ selected?: string; view?: string; q?: string; titleSort?: string }>;
};

export default async function DoctorClinicalTestsPage({ searchParams }: PageProps) {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();
  const sp = (await searchParams) ?? {};
  const q = typeof sp.q === "string" ? sp.q : "";
  const titleSort: ClinicalTestTitleSort | null =
    sp.titleSort === "asc" || sp.titleSort === "desc" ? sp.titleSort : null;

  const items = await deps.clinicalTests.listClinicalTests({
    search: q || null,
    includeArchived: false,
  });

  const rawSelected = typeof sp.selected === "string" ? sp.selected.trim() : "";
  const initialSelectedId =
    rawSelected && items.some((t) => t.id === rawSelected) ? rawSelected : null;
  const initialViewMode: ClinicalTestsViewMode = sp.view === "list" ? "list" : "tiles";

  return (
    <AppShell title="Клинические тесты" user={session.user} variant="doctor" backHref="/app/doctor">
      <ClinicalTestsPageClient
        initialItems={items}
        initialSelectedId={initialSelectedId}
        initialViewMode={initialViewMode}
        initialTitleSort={titleSort}
        filters={{ q }}
      />
    </AppShell>
  );
}
