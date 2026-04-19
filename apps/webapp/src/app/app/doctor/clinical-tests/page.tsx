import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { AppShell } from "@/shared/ui/AppShell";
import {
  ClinicalTestsPageClient,
  type ClinicalTestsViewMode,
} from "./ClinicalTestsPageClient";

type PageProps = {
  searchParams?: Promise<{ selected?: string; view?: string }>;
};

export default async function DoctorClinicalTestsPage({ searchParams }: PageProps) {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();
  const items = await deps.clinicalTests.listClinicalTests({ includeArchived: false });

  const sp = (await searchParams) ?? {};
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
      />
    </AppShell>
  );
}
