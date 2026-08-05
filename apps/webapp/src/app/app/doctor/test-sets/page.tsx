import { requireDoctorAccess } from '@/app-layer/guards/requireRole';
import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import { DoctorPageHeader } from '@/shared/ui/doctor/shell/DoctorPageHeader';
import {
  parseDoctorCatalogPubArchQuery,
  testSetListFilterFromPubArch,
} from '@/shared/lib/doctorCatalogListStatus';
import { parseDoctorCatalogRegionQueryParam } from '@/shared/lib/doctorCatalogRegionQuery';
import { doctorCatalogClientFilterUrlHints } from '@/shared/lib/doctorCatalogClientUrlSync';
import type { TestSet, TestSetUsageSnapshot } from '@/modules/tests/types';
import { clinicalTestLibraryRows, type ClinicalTestLibraryPickRow } from './clinicalTestLibraryRows';
import { TestSetsPageClient } from './TestSetsPageClient';

type PageProps = {
  searchParams?: Promise<{
    selected?: string;
    q?: string;
    region?: string;
    titleSort?: string;
    status?: string;
    arch?: string;
    pub?: string;
  }>;
};

type TestSetsBootstrap = {
  items: TestSet[];
  initialSelectedId: string | null;
  initialSelectedUsageSnapshot: TestSetUsageSnapshot | null;
  clinicalTestsLibrary: ClinicalTestLibraryPickRow[];
};

export default async function DoctorTestSetsPage({ searchParams }: PageProps) {
  const session = await requireDoctorAccess();
  const { buildAppDeps } = await import('@/app-layer/di/buildAppDeps');
  const deps = buildAppDeps();

  const sp = (await searchParams) ?? {};
  const q = typeof sp.q === 'string' ? sp.q : '';
  const regionParsed = parseDoctorCatalogRegionQueryParam(sp.region);

  const listPubArch = parseDoctorCatalogPubArchQuery(sp);
  const bodyRegionItemsPromise = deps.references.listActiveItemsByCategoryCode('body_region');

  const raw = typeof sp.selected === 'string' ? sp.selected.trim() : '';

  const listPromise: Promise<TestSetsBootstrap> = Promise.all([
    deps.testSets.listTestSets(testSetListFilterFromPubArch(listPubArch)),
    deps.clinicalTests.listClinicalTests({ archiveScope: 'active' }),
  ]).then(async ([items, clinicalTestsForPicker]) => {
    const clinicalTestsLibrary = clinicalTestLibraryRows(clinicalTestsForPicker);
    const initialSelectedId = raw && items.some((s) => s.id === raw) ? raw : null;
    const initialSelectedUsageSnapshot =
      initialSelectedId != null ? await deps.testSets.getTestSetUsage(initialSelectedId) : null;
    return {
      items,
      initialSelectedId,
      initialSelectedUsageSnapshot,
      clinicalTestsLibrary,
    };
  });

  const bodyRegionItems = await bodyRegionItemsPromise;
  const bodyRegionIdToCode = Object.fromEntries(bodyRegionItems.map((it) => [it.id, it.code]));

  return (
    <DoctorAppShell title="Наборы тестов" user={session.user} backHref="/app/doctor">
      <DoctorPageHeader title="Наборы тестов" />
      <TestSetsPageClient
        listPromise={listPromise}
        bodyRegionIdToCode={bodyRegionIdToCode}
        filters={{
          q,
          regionCode: regionParsed.regionCode,
          listPubArch,
          ...doctorCatalogClientFilterUrlHints(sp),
        }}
      />
    </DoctorAppShell>
  );
}
