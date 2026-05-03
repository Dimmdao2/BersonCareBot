import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { AppShell } from "@/shared/ui/AppShell";
import {
  parseDoctorCatalogPubArchQuery,
  testSetListFilterFromPubArch,
} from "@/shared/lib/doctorCatalogListStatus";
import { parseDoctorCatalogRegionQueryParam } from "@/shared/lib/doctorCatalogRegionQuery";
import { clinicalTestLibraryRows } from "./clinicalTestLibraryRows";
import { TestSetsPageClient } from "./TestSetsPageClient";

type PageProps = {
  searchParams?: Promise<{
    selected?: string;
    q?: string;
    region?: string;
    load?: string;
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
  const regionParsed = parseDoctorCatalogRegionQueryParam(sp.region);
  const loadType =
    sp.load === "strength" ||
    sp.load === "stretch" ||
    sp.load === "balance" ||
    sp.load === "cardio" ||
    sp.load === "other"
      ? sp.load
      : undefined;

  const listPubArch = parseDoctorCatalogPubArchQuery(sp);

  const [items, bodyRegionItems] = await Promise.all([
    deps.testSets.listTestSets(testSetListFilterFromPubArch(listPubArch)),
    deps.references.listActiveItemsByCategoryCode("body_region"),
  ]);
  const bodyRegionIdToCode = Object.fromEntries(bodyRegionItems.map((it) => [it.id, it.code]));

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
        bodyRegionIdToCode={bodyRegionIdToCode}
        filters={{
          q,
          regionCode: regionParsed.regionCode,
          invalidRegionQuery: regionParsed.invalidRegionQuery,
          loadType,
          listPubArch,
        }}
      />
    </AppShell>
  );
}
