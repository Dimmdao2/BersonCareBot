import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import {
  parseDoctorCatalogListStatus,
  testSetArchiveScopeFromCatalogStatus,
} from "@/shared/lib/doctorCatalogListStatus";
import { AppShell } from "@/shared/ui/AppShell";
import { TestSetsPageClient } from "./TestSetsPageClient";

type PageProps = {
  searchParams?: Promise<{ selected?: string; scope?: string; status?: string }>;
};

export default async function DoctorTestSetsPage({ searchParams }: PageProps) {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();

  const sp = (await searchParams) ?? {};
  const catalogListStatus = parseDoctorCatalogListStatus(
    {
      status: typeof sp.status === "string" ? sp.status : undefined,
      scope: typeof sp.scope === "string" ? sp.scope : undefined,
    },
    "published",
  );
  const archiveScope = testSetArchiveScopeFromCatalogStatus(catalogListStatus);

  const items = await deps.testSets.listTestSets({ archiveScope });

  const raw = typeof sp.selected === "string" ? sp.selected.trim() : "";
  const initialSelectedId = raw && items.some((s) => s.id === raw) ? raw : null;

  return (
    <AppShell title="Наборы тестов" user={session.user} variant="doctor" backHref="/app/doctor">
      <TestSetsPageClient
        initialSets={items}
        initialSelectedId={initialSelectedId}
        initialCatalogStatus={catalogListStatus}
      />
    </AppShell>
  );
}
