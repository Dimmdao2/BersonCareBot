import { requireDoctorWorkspaceContext } from '@/app-layer/guards/requireRole';
import { requireEntitlementForReadAction } from '@/app-layer/guards/requireEntitlement';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import type { ExerciseLoadType } from '@/modules/lfk-exercises/types';
import {
  EXERCISE_LOAD_TYPE_CATEGORY_CODE,
  exerciseLoadTypeWriteAllowSet,
  parseExerciseLoadQueryParam,
} from '@/modules/lfk-exercises/exerciseLoadTypeReference';
import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import { DoctorPageHeader } from '@/shared/ui/doctor/shell/DoctorPageHeader';
import {
  lfkTemplateFilterFromPubArch,
  parseDoctorCatalogPubArchQuery,
  type DoctorCatalogPubArchQuery,
} from '@/shared/lib/doctorCatalogListStatus';
import { parseDoctorCatalogRegionQueryParam } from '@/shared/lib/doctorCatalogRegionQuery';
import { doctorCatalogClientFilterUrlHints } from '@/shared/lib/doctorCatalogClientUrlSync';
import { LfkTemplatesPageClient } from './LfkTemplatesPageClient';

type PageProps = {
  searchParams?: Promise<{
    q?: string;
    region?: string;
    load?: string;
    titleSort?: string;
    status?: string;
    arch?: string;
    pub?: string;
    selected?: string;
  }>;
};

export default async function DoctorLfkTemplatesPage({ searchParams }: PageProps) {
  const workspace = await requireDoctorWorkspaceContext();
  const session = workspace.session;
  const sp = (await searchParams) ?? {};

  const q = typeof sp.q === 'string' ? sp.q : '';
  const regionParsed = parseDoctorCatalogRegionQueryParam(sp.region);

  const initialTitleSort = sp.titleSort === 'asc' || sp.titleSort === 'desc' ? sp.titleSort : null;
  const listPubArch: DoctorCatalogPubArchQuery = parseDoctorCatalogPubArchQuery(sp);
  const initialSelectedId =
    typeof sp.selected === 'string' && sp.selected.trim() ? sp.selected.trim() : null;

  const deps = buildAppDeps();
  const [includePlatformPackages, includePlatformExercises] = await Promise.all([
    requireEntitlementForReadAction(workspace, 'exercise_packages'),
    requireEntitlementForReadAction(workspace, 'exercise_catalog'),
  ]);

  // Lightweight filter refs block shell minimally; heavy lists stream via promise-props.
  const [bodyRegionItems, loadTypeRefItems] = await Promise.all([
    deps.references.listActiveItemsByCategoryCode('body_region'),
    deps.references.listActiveItemsByCategoryCode(EXERCISE_LOAD_TYPE_CATEGORY_CODE),
  ]);
  const loadAllow = exerciseLoadTypeWriteAllowSet(loadTypeRefItems);
  const loadType = parseExerciseLoadQueryParam(
    typeof sp.load === 'string' ? sp.load : undefined,
    loadAllow,
  );
  const bodyRegionIdToCode = Object.fromEntries(bodyRegionItems.map((it) => [it.id, it.code]));

  const templatesPromise = deps.lfkTemplates.listTemplates({
    includeExerciseDetails: true,
    includePlatformBase: includePlatformPackages.ok,
    ...lfkTemplateFilterFromPubArch(listPubArch),
  });

  const exerciseCatalogPromise = deps.lfkExercises
    .listExercises({
      includeArchived: false,
      includePlatformBase: includePlatformExercises.ok,
    })
    .then((exercises) => {
      const exerciseMetaById: Record<
        string,
        { regionRefIds: readonly string[]; loadType: ExerciseLoadType | null }
      > = {};
      for (const e of exercises) {
        exerciseMetaById[e.id] = { regionRefIds: e.regionRefIds, loadType: e.loadType };
      }
      const exerciseCatalog = exercises.map((e) => ({
        id: e.id,
        title: e.title,
        firstMedia: e.media[0] ?? null,
      }));
      return { exerciseCatalog, exerciseMetaById };
    });

  return (
    <DoctorAppShell title="Комплексы" user={session.user} backHref="/app/doctor">
      <DoctorPageHeader title="Комплексы" />
      <LfkTemplatesPageClient
        templatesPromise={templatesPromise}
        exerciseCatalogPromise={exerciseCatalogPromise}
        initialSelectedId={initialSelectedId}
        bodyRegionIdToCode={bodyRegionIdToCode}
        filters={{
          q,
          regionCode: regionParsed.regionCode,
          loadType,
          listPubArch,
          ...doctorCatalogClientFilterUrlHints(sp),
        }}
        initialTitleSort={initialTitleSort}
      />
    </DoctorAppShell>
  );
}
