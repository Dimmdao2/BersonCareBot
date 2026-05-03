import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import type { ExerciseLoadType } from "@/modules/lfk-exercises/types";
import { AppShell } from "@/shared/ui/AppShell";
import {
  parseDoctorCatalogPubArchQuery,
  testSetListFilterFromPubArch,
} from "@/shared/lib/doctorCatalogListStatus";
import { clinicalTestLibraryRows } from "./clinicalTestLibraryRows";
import { TestSetsPageClient } from "./TestSetsPageClient";

type PageProps = {
  searchParams?: Promise<{
    selected?: string;
    q?: string;
    regionRefId?: string;
    loadType?: string;
    titleSort?: string;
    status?: string;
    arch?: string;
    pub?: string;
  }>;
};

export default async function DoctorTestSetsPage({ searchParams }: PageProps) {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();

  const sp = (await searchParams) ?? {};
  const q = typeof sp.q === "string" ? sp.q : "";
  const regionRefId = typeof sp.regionRefId === "string" && sp.regionRefId.trim() ? sp.regionRefId.trim() : undefined;
  const loadType =
    sp.loadType === "strength" ||
    sp.loadType === "stretch" ||
    sp.loadType === "balance" ||
    sp.loadType === "cardio" ||
    sp.loadType === "other"
      ? (sp.loadType as ExerciseLoadType)
      : undefined;

  const listPubArch = parseDoctorCatalogPubArchQuery(sp);

  const items = await deps.testSets.listTestSets(testSetListFilterFromPubArch(listPubArch, q || null));

  const clinicalTestsForPicker = await deps.clinicalTests.listClinicalTests({ archiveScope: "active" });
  const clinicalTestsLibrary = clinicalTestLibraryRows(clinicalTestsForPicker);

  const raw = typeof sp.selected === "string" ? sp.selected.trim() : "";
  const initialSelectedId = raw && items.some((s) => s.id === raw) ? raw : null;
  const initialSelectedUsageSnapshot =
    initialSelectedId != null ? await deps.testSets.getTestSetUsage(initialSelectedId) : null;

  return (
    <AppShell title="Наборы тестов" user={session.user} variant="doctor" backHref="/app/doctor">
      <TestSetsPageClient
        initialSets={items}
        initialSelectedId={initialSelectedId}
        initialSelectedUsageSnapshot={initialSelectedUsageSnapshot}
        clinicalTestsLibrary={clinicalTestsLibrary}
        filters={{ q, regionRefId, loadType, listPubArch }}
      />
    </AppShell>
  );
}
